use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct MountInfo {
    pub mount_point: String,
    pub used_bytes: u64,
    pub total_bytes: u64,
    pub pct: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct StorageInfo {
    pub mounts: Vec<MountInfo>,
}

pub fn collect(disks: &sysinfo::Disks) -> StorageInfo {
    let mounts = disks
        .list()
        .iter()
        .filter(|disk| disk.total_space() > 0)
        .map(|disk| {
            let total = disk.total_space();
            let available = disk.available_space();
            let used = total.saturating_sub(available);
            let pct = if total > 0 {
                used as f32 / total as f32 * 100.0
            } else {
                0.0
            };
            MountInfo {
                mount_point: disk.mount_point().to_string_lossy().to_string(),
                used_bytes: used,
                total_bytes: total,
                pct,
            }
        })
        .collect();
    StorageInfo { mounts }
}
