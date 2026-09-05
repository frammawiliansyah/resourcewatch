use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct CpuInfo {
    pub usage_pct: f32,
    pub per_core: Vec<f32>,
    pub temp_c: Option<f32>,
}

pub fn collect(sys: &sysinfo::System, temp_c: Option<f32>) -> CpuInfo {
    CpuInfo {
        usage_pct: sys.global_cpu_usage(),
        per_core: sys.cpus().iter().map(|c| c.cpu_usage()).collect(),
        temp_c,
    }
}
