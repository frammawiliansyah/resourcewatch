use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct RamInfo {
    pub used_bytes: u64,
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub swap_used_bytes: u64,
    pub swap_total_bytes: u64,
}

pub fn collect(sys: &sysinfo::System) -> RamInfo {
    RamInfo {
        used_bytes: sys.used_memory(),
        total_bytes: sys.total_memory(),
        available_bytes: sys.available_memory(),
        swap_used_bytes: sys.used_swap(),
        swap_total_bytes: sys.total_swap(),
    }
}
