use nvml_wrapper::Nvml;
use nvml_wrapper::enum_wrappers::device::TemperatureSensor;
use serde::Serialize;

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
        }
    }
}

/// Wraps NVML initialization. If there's no NVIDIA driver/GPU present, or
/// NVML fails to load for any other reason, `nvml` stays `None` forever and
/// every snapshot simply reports `available: false` — this must never crash
/// the service on non-NVIDIA machines.
pub struct GpuMonitor {
    nvml: Option<Nvml>,
}

impl GpuMonitor {
    pub fn new() -> Self {
        match Nvml::init() {
            Ok(nvml) => {
                tracing::info!("NVML initialized, GPU monitoring enabled");
                Self { nvml: Some(nvml) }
            }
            Err(e) => {
                tracing::warn!("NVML init failed ({e}), GPU monitoring disabled");
                Self { nvml: None }
            }
        }
    }

    pub fn collect(&self) -> GpuInfo {
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

        GpuInfo {
            available: true,
            name,
            util_pct,
            mem_used_bytes,
            mem_total_bytes,
            temp_c,
            power_w,
            fan_pct,
        }
    }
}
