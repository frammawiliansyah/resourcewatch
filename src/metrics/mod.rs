pub mod battery;
pub mod cpu;
pub mod diskio;
pub mod fans;
pub mod gpu;
pub mod network;
pub mod processes;
pub mod ram;
pub mod storage;
pub mod temperature;

use serde::Serialize;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use sysinfo::{Components, Disks, Networks, System};

#[derive(Debug, Clone, Serialize)]
pub struct Snapshot {
    pub ts: u64,
    pub cpu: cpu::CpuInfo,
    pub ram: ram::RamInfo,
    pub gpu: gpu::GpuInfo,
    pub storage: storage::StorageInfo,
    pub network: network::NetworkInfo,
    pub disk_io: diskio::DiskIoInfo,
    pub battery: battery::BatteryInfo,
    pub fans: fans::FanInfo,
    pub processes: processes::ProcessesInfo,
}

pub struct Collector {
    sys: System,
    disks: Disks,
    networks: Networks,
    components: Components,
    gpu: gpu::GpuMonitor,
    fans: fans::FanMonitor,
    battery: battery::BatteryMonitor,
    last_tick: Instant,
}

impl Collector {
    pub fn new() -> Self {
        Self {
            sys: System::new_all(),
            disks: Disks::new_with_refreshed_list(),
            networks: Networks::new_with_refreshed_list(),
            components: Components::new_with_refreshed_list(),
            gpu: gpu::GpuMonitor::new(),
            fans: fans::FanMonitor::new(),
            battery: battery::BatteryMonitor::new(),
            last_tick: Instant::now(),
        }
    }

    pub fn tick(&mut self) -> Snapshot {
        let elapsed_secs = self.last_tick.elapsed().as_secs_f64();
        self.last_tick = Instant::now();

        self.sys.refresh_all();
        self.disks.refresh(false);
        self.networks.refresh(false);
        self.components.refresh(false);

        let temp_c = temperature::cpu_temp(&self.components);
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        Snapshot {
            ts,
            cpu: cpu::collect(&self.sys, temp_c),
            ram: ram::collect(&self.sys),
            gpu: self.gpu.collect(),
            storage: storage::collect(&self.disks),
            network: network::collect(&self.networks, elapsed_secs),
            disk_io: diskio::collect(&self.disks, elapsed_secs),
            battery: self.battery.collect(),
            fans: self.fans.collect(),
            processes: processes::collect(&self.sys),
        }
    }
}
