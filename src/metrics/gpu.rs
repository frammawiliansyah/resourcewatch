use nvml_wrapper::enum_wrappers::device::TemperatureSensor;
use nvml_wrapper::enums::device::UsedGpuMemory;
use nvml_wrapper::error::NvmlError;
use nvml_wrapper::{Device, Nvml};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use sysinfo::{Pid, System};

/// A process holding a GPU context, shared by the NVIDIA (NVML) and Intel
/// (helper file) views.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuProcess {
    pub pid: u32,
    pub name: String,
    /// 3D/compute share of the GPU, `None` when the driver can't attribute it.
    pub util_pct: Option<f32>,
    pub mem_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GpuInfo {
    pub available: bool,
    pub name: Option<String>,
    pub util_pct: Option<f32>,
    pub mem_used_bytes: Option<u64>,
    pub mem_total_bytes: Option<u64>,
    pub temp_c: Option<f32>,
    pub power_w: Option<f32>,
    pub fan_pct: Option<f32>,
    pub processes: Vec<GpuProcess>,
}

impl GpuInfo {
    fn unavailable() -> Self {
        Self {
            available: false,
            name: None,
            util_pct: None,
            mem_used_bytes: None,
            mem_total_bytes: None,
            temp_c: None,
            power_w: None,
            fan_pct: None,
            processes: Vec::new(),
        }
    }
}

/// Wraps NVML initialization. If there's no NVIDIA driver/GPU present, or
/// NVML fails to load for any other reason, `nvml` stays `None` forever and
/// every snapshot simply reports `available: false`. This must never crash
/// the service on non-NVIDIA machines.
pub struct GpuMonitor {
    nvml: Option<Nvml>,
    /// NVML hands back per-process samples newer than this (microseconds).
    last_util_ts: u64,
}

fn process_name(sys: &System, pid: u32) -> String {
    sys.process(Pid::from_u32(pid))
        .map(|p| p.name().to_string_lossy().into_owned())
        .unwrap_or_else(|| format!("pid {pid}"))
}

/// NVML lists graphics and compute contexts separately, and a process doing
/// both (e.g. `C+G` in nvidia-smi) appears in each, so they're merged by pid.
fn nvidia_processes(device: &Device, sys: &System, last_util_ts: &mut u64) -> Vec<GpuProcess> {
    let mut mem_by_pid: HashMap<u32, Option<u64>> = HashMap::new();
    let lists = [
        device.running_graphics_processes(),
        device.running_compute_processes(),
    ];
    for info in lists.into_iter().flatten().flatten() {
        let mem = match info.used_gpu_memory {
            UsedGpuMemory::Used(bytes) => Some(bytes),
            UsedGpuMemory::Unavailable => None,
        };
        let slot = mem_by_pid.entry(info.pid).or_insert(None);
        *slot = (*slot).max(mem);
    }

    let utilization: Option<HashMap<u32, u32>> =
        match device.process_utilization_stats(*last_util_ts) {
            Ok(samples) => {
                let mut latest: HashMap<u32, (u64, u32)> = HashMap::new();
                for sample in samples {
                    *last_util_ts = (*last_util_ts).max(sample.timestamp);
                    let entry = latest.entry(sample.pid).or_insert((0, 0));
                    if sample.timestamp >= entry.0 {
                        *entry = (sample.timestamp, sample.sm_util);
                    }
                }
                Some(
                    latest
                        .into_iter()
                        .map(|(pid, (_, util))| (pid, util))
                        .collect(),
                )
            }
            // No samples since the last tick just means nothing drew anything.
            Err(NvmlError::NotFound) => Some(HashMap::new()),
            Err(_) => None,
        };

    let mut processes: Vec<GpuProcess> = mem_by_pid
        .into_iter()
        .map(|(pid, mem_bytes)| GpuProcess {
            pid,
            name: process_name(sys, pid),
            util_pct: utilization
                .as_ref()
                .map(|u| u.get(&pid).copied().unwrap_or(0) as f32),
            mem_bytes,
        })
        .collect();
    processes.sort_by(|a, b| {
        b.util_pct
            .unwrap_or(0.0)
            .total_cmp(&a.util_pct.unwrap_or(0.0))
            .then(b.mem_bytes.cmp(&a.mem_bytes))
    });
    processes
}

impl GpuMonitor {
    pub fn new() -> Self {
        match Nvml::init() {
            Ok(nvml) => {
                tracing::info!("NVML initialized, GPU monitoring enabled");
                Self {
                    nvml: Some(nvml),
                    last_util_ts: 0,
                }
            }
            Err(e) => {
                tracing::warn!("NVML init failed ({e}), GPU monitoring disabled");
                Self {
                    nvml: None,
                    last_util_ts: 0,
                }
            }
        }
    }

    pub fn collect(&mut self, sys: &System) -> GpuInfo {
        let Some(nvml) = &self.nvml else {
            return GpuInfo::unavailable();
        };
        let Ok(device) = nvml.device_by_index(0) else {
            return GpuInfo::unavailable();
        };

        let name = device.name().ok();
        let util_pct = device.utilization_rates().ok().map(|u| u.gpu as f32);
        let (mem_used_bytes, mem_total_bytes) = match device.memory_info() {
            Ok(mem) => (Some(mem.used), Some(mem.total)),
            Err(_) => (None, None),
        };
        let temp_c = device
            .temperature(TemperatureSensor::Gpu)
            .ok()
            .map(|t| t as f32);
        let power_w = device.power_usage().ok().map(|mw| mw as f32 / 1000.0);
        let fan_pct = device.fan_speed(0).ok().map(|p| p as f32);
        let processes = nvidia_processes(&device, sys, &mut self.last_util_ts);

        GpuInfo {
            available: true,
            name,
            util_pct,
            mem_used_bytes,
            mem_total_bytes,
            temp_c,
            power_w,
            fan_pct,
            processes,
        }
    }
}
