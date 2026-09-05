use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct DiskIoInfo {
    pub read_bytes_per_sec: u64,
    pub write_bytes_per_sec: u64,
}

/// `disks` must already have been refreshed for this tick. `Disk::usage()`
/// reports bytes read/written since the previous refresh (sysinfo tracks the
/// per-block-device counters internally), so no manual /proc/diskstats
/// parsing is needed.
pub fn collect(disks: &sysinfo::Disks, elapsed_secs: f64) -> DiskIoInfo {
    let elapsed_secs = elapsed_secs.max(0.001);
    let mut read_bytes = 0u64;
    let mut write_bytes = 0u64;
    for disk in disks.list() {
        let usage = disk.usage();
        read_bytes += usage.read_bytes;
        write_bytes += usage.written_bytes;
    }
    DiskIoInfo {
        read_bytes_per_sec: (read_bytes as f64 / elapsed_secs) as u64,
        write_bytes_per_sec: (write_bytes as f64 / elapsed_secs) as u64,
    }
}
