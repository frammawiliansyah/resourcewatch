CREATE TABLE IF NOT EXISTS snapshots (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ts                  INTEGER NOT NULL,
    cpu_usage_pct       REAL    NOT NULL,
    cpu_per_core_json   TEXT,
    cpu_temp_c          REAL,
    ram_used_bytes      INTEGER NOT NULL,
    ram_total_bytes     INTEGER NOT NULL,
    ram_available_bytes INTEGER NOT NULL,
    swap_used_bytes     INTEGER NOT NULL,
    swap_total_bytes    INTEGER NOT NULL,
    gpu_available       INTEGER NOT NULL,
    gpu_util_pct        REAL,
    gpu_mem_used_bytes  INTEGER,
    gpu_mem_total_bytes INTEGER,
    gpu_temp_c          REAL,
    gpu_power_w         REAL,
    gpu_fan_pct         REAL,
    net_rx_bytes_per_sec  INTEGER NOT NULL,
    net_tx_bytes_per_sec  INTEGER NOT NULL,
    disk_read_bytes_per_sec  INTEGER NOT NULL,
    disk_write_bytes_per_sec INTEGER NOT NULL,
    battery_available   INTEGER NOT NULL,
    battery_pct         REAL,
    battery_status      TEXT,
    top_processes_json  TEXT
);
CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON snapshots(ts);

CREATE TABLE IF NOT EXISTS disk_usage_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_ts INTEGER NOT NULL,
    mount_point TEXT NOT NULL,
    used_bytes INTEGER NOT NULL,
    total_bytes INTEGER NOT NULL,
    pct REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_disk_usage_ts ON disk_usage_snapshots(snapshot_ts);
CREATE INDEX IF NOT EXISTS idx_disk_usage_mount ON disk_usage_snapshots(mount_point, snapshot_ts);

CREATE TABLE IF NOT EXISTS net_if_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_ts INTEGER NOT NULL,
    iface TEXT NOT NULL,
    rx_bytes_per_sec INTEGER NOT NULL,
    tx_bytes_per_sec INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_net_if_ts ON net_if_snapshots(snapshot_ts);
CREATE INDEX IF NOT EXISTS idx_net_if_iface ON net_if_snapshots(iface, snapshot_ts);
