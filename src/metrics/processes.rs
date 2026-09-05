use serde::Serialize;

const TOP_N: usize = 8;

#[derive(Debug, Clone, Serialize)]
pub struct ProcessEntry {
    pub pid: u32,
    pub name: String,
    pub cpu_pct: f32,
    pub mem_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProcessesInfo {
    pub top_cpu: Vec<ProcessEntry>,
    pub top_mem: Vec<ProcessEntry>,
}

pub fn collect(sys: &sysinfo::System) -> ProcessesInfo {
    let mut entries: Vec<ProcessEntry> = sys
        .processes()
        .values()
        .map(|p| ProcessEntry {
            pid: p.pid().as_u32(),
            name: p.name().to_string_lossy().to_string(),
            cpu_pct: p.cpu_usage(),
            mem_bytes: p.memory(),
        })
        .collect();

    entries.sort_by(|a, b| b.cpu_pct.total_cmp(&a.cpu_pct));
    let top_cpu = entries.iter().take(TOP_N).cloned().collect();

    entries.sort_by_key(|e| std::cmp::Reverse(e.mem_bytes));
    let top_mem = entries.into_iter().take(TOP_N).collect();

    ProcessesInfo { top_cpu, top_mem }
}
