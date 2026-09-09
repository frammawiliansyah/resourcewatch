use std::collections::HashMap;

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

/// Collects unique physical partitions, deduplicated by backing device.
///
/// Bind mounts of the same partition into several mount points are common
/// under systemd sandboxing (`PrivateTmp=true` binds a private `/tmp` and
/// `/var/tmp`, `ReadWritePaths=` binds a data directory) and show up in
/// `sysinfo::Disks` as separate entries with the same device name and
/// identical usage. Only the mount point closest to the filesystem root is
/// kept per device, so `/tmp`, `/var/tmp`, or a `ReadWritePaths` target
/// collapse into the real partition (`/`) instead of being listed
/// redundantly alongside genuinely distinct partitions.
pub fn collect(disks: &sysinfo::Disks) -> StorageInfo {
    let mut by_device: HashMap<String, (usize, MountInfo)> = HashMap::new();

    for disk in disks.list().iter().filter(|disk| disk.total_space() > 0) {
        let total = disk.total_space();
        let available = disk.available_space();
        let used = total.saturating_sub(available);
        let pct = if total > 0 {
            used as f32 / total as f32 * 100.0
        } else {
            0.0
        };

        let mount_point = disk.mount_point();
        let depth = mount_point.components().count();
        let device = disk.name().to_string_lossy().into_owned();
        let info = MountInfo {
            mount_point: mount_point.to_string_lossy().into_owned(),
            used_bytes: used,
            total_bytes: total,
            pct,
        };

        by_device
            .entry(device)
            .and_modify(|(existing_depth, existing)| {
                if depth < *existing_depth {
                    *existing_depth = depth;
                    *existing = info.clone();
                }
            })
            .or_insert((depth, info));
    }

    let mut mounts: Vec<MountInfo> = by_device.into_values().map(|(_, info)| info).collect();
    mounts.sort_by(|a, b| a.mount_point.cmp(&b.mount_point));
    StorageInfo { mounts }
}
