use crate::metrics::Snapshot;
use rusqlite::{Connection, params};
use serde_json::{Value, json};
use std::path::Path;

pub fn open(path: &str) -> rusqlite::Result<Connection> {
    if let Some(parent) = Path::new(path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         PRAGMA auto_vacuum=INCREMENTAL;",
    )?;
    conn.execute_batch(include_str!("schema.sql"))?;
    Ok(conn)
}

pub fn insert_snapshot(conn: &mut Connection, snap: &Snapshot) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    let per_core_json = serde_json::to_string(&snap.cpu.per_core).unwrap_or_default();
    let top_processes_json = serde_json::to_string(&snap.processes).unwrap_or_default();

    tx.execute(
        "INSERT INTO snapshots (
            ts, cpu_usage_pct, cpu_per_core_json, cpu_temp_c,
            ram_used_bytes, ram_total_bytes, ram_available_bytes, swap_used_bytes, swap_total_bytes,
            gpu_available, gpu_util_pct, gpu_mem_used_bytes, gpu_mem_total_bytes, gpu_temp_c, gpu_power_w, gpu_fan_pct,
            net_rx_bytes_per_sec, net_tx_bytes_per_sec,
            disk_read_bytes_per_sec, disk_write_bytes_per_sec,
            battery_available, battery_pct, battery_status, top_processes_json
        ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24)",
        params![
            snap.ts as i64,
            snap.cpu.usage_pct,
            per_core_json,
            snap.cpu.temp_c,
            snap.ram.used_bytes as i64,
            snap.ram.total_bytes as i64,
            snap.ram.available_bytes as i64,
            snap.ram.swap_used_bytes as i64,
            snap.ram.swap_total_bytes as i64,
            snap.gpu.available,
            snap.gpu.util_pct,
            snap.gpu.mem_used_bytes.map(|v| v as i64),
            snap.gpu.mem_total_bytes.map(|v| v as i64),
            snap.gpu.temp_c,
            snap.gpu.power_w,
            snap.gpu.fan_pct,
            snap.network.rx_bytes_per_sec as i64,
            snap.network.tx_bytes_per_sec as i64,
            snap.disk_io.read_bytes_per_sec as i64,
            snap.disk_io.write_bytes_per_sec as i64,
            snap.battery.available,
            snap.battery.pct,
            snap.battery.status,
            top_processes_json,
        ],
    )?;

    for mount in &snap.storage.mounts {
        tx.execute(
            "INSERT INTO disk_usage_snapshots (snapshot_ts, mount_point, used_bytes, total_bytes, pct) VALUES (?1,?2,?3,?4,?5)",
            params![
                snap.ts as i64,
                mount.mount_point,
                mount.used_bytes as i64,
                mount.total_bytes as i64,
                mount.pct
            ],
        )?;
    }
    for iface in &snap.network.interfaces {
        tx.execute(
            "INSERT INTO net_if_snapshots (snapshot_ts, iface, rx_bytes_per_sec, tx_bytes_per_sec) VALUES (?1,?2,?3,?4)",
            params![
                snap.ts as i64,
                iface.name,
                iface.rx_bytes_per_sec as i64,
                iface.tx_bytes_per_sec as i64
            ],
        )?;
    }

    tx.commit()
}

pub fn delete_older_than(conn: &Connection, cutoff_ts_millis: i64) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM snapshots WHERE ts < ?1",
        params![cutoff_ts_millis],
    )?;
    conn.execute(
        "DELETE FROM disk_usage_snapshots WHERE snapshot_ts < ?1",
        params![cutoff_ts_millis],
    )?;
    conn.execute(
        "DELETE FROM net_if_snapshots WHERE snapshot_ts < ?1",
        params![cutoff_ts_millis],
    )?;
    conn.execute_batch("PRAGMA incremental_vacuum;")?;
    Ok(())
}

pub fn available_mounts(conn: &Connection) -> rusqlite::Result<Vec<String>> {
    let mut stmt =
        conn.prepare("SELECT DISTINCT mount_point FROM disk_usage_snapshots ORDER BY mount_point")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    rows.collect()
}

/// Historical query dispatch. `mount` is required (and used) only for the
/// `storage` metric; `iface` is an optional filter for `network` (defaults
/// to the aggregate series when absent).
pub fn query_history(
    conn: &Connection,
    metric: &str,
    from_ts: i64,
    to_ts: i64,
    mount: Option<&str>,
    iface: Option<&str>,
) -> rusqlite::Result<Vec<Value>> {
    match metric {
        "cpu" => {
            let mut stmt = conn.prepare(
                "SELECT ts, cpu_usage_pct, cpu_per_core_json, cpu_temp_c FROM snapshots
                 WHERE ts BETWEEN ?1 AND ?2 ORDER BY ts",
            )?;
            let rows = stmt.query_map(params![from_ts, to_ts], |row| {
                let per_core_json: Option<String> = row.get(2)?;
                let per_core: Vec<f32> = per_core_json
                    .and_then(|s| serde_json::from_str(&s).ok())
                    .unwrap_or_default();
                Ok(json!({
                    "ts": row.get::<_, i64>(0)?,
                    "usage_pct": row.get::<_, f64>(1)?,
                    "per_core": per_core,
                    "temp_c": row.get::<_, Option<f64>>(3)?,
                }))
            })?;
            rows.collect()
        }
        "ram" => {
            let mut stmt = conn.prepare(
                "SELECT ts, ram_used_bytes, ram_total_bytes, ram_available_bytes, swap_used_bytes, swap_total_bytes
                 FROM snapshots WHERE ts BETWEEN ?1 AND ?2 ORDER BY ts",
            )?;
            let rows = stmt.query_map(params![from_ts, to_ts], |row| {
                Ok(json!({
                    "ts": row.get::<_, i64>(0)?,
                    "used_bytes": row.get::<_, i64>(1)?,
                    "total_bytes": row.get::<_, i64>(2)?,
                    "available_bytes": row.get::<_, i64>(3)?,
                    "swap_used_bytes": row.get::<_, i64>(4)?,
                    "swap_total_bytes": row.get::<_, i64>(5)?,
                }))
            })?;
            rows.collect()
        }
        "gpu" => {
            let mut stmt = conn.prepare(
                "SELECT ts, gpu_available, gpu_util_pct, gpu_mem_used_bytes, gpu_mem_total_bytes, gpu_temp_c, gpu_power_w
                 FROM snapshots WHERE ts BETWEEN ?1 AND ?2 ORDER BY ts",
            )?;
            let rows = stmt.query_map(params![from_ts, to_ts], |row| {
                Ok(json!({
                    "ts": row.get::<_, i64>(0)?,
                    "available": row.get::<_, bool>(1)?,
                    "util_pct": row.get::<_, Option<f64>>(2)?,
                    "mem_used_bytes": row.get::<_, Option<i64>>(3)?,
                    "mem_total_bytes": row.get::<_, Option<i64>>(4)?,
                    "temp_c": row.get::<_, Option<f64>>(5)?,
                    "power_w": row.get::<_, Option<f64>>(6)?,
                }))
            })?;
            rows.collect()
        }
        "diskio" => {
            let mut stmt = conn.prepare(
                "SELECT ts, disk_read_bytes_per_sec, disk_write_bytes_per_sec
                 FROM snapshots WHERE ts BETWEEN ?1 AND ?2 ORDER BY ts",
            )?;
            let rows = stmt.query_map(params![from_ts, to_ts], |row| {
                Ok(json!({
                    "ts": row.get::<_, i64>(0)?,
                    "read_bytes_per_sec": row.get::<_, i64>(1)?,
                    "write_bytes_per_sec": row.get::<_, i64>(2)?,
                }))
            })?;
            rows.collect()
        }
        "temperature" => {
            let mut stmt = conn.prepare(
                "SELECT ts, cpu_temp_c, gpu_temp_c FROM snapshots WHERE ts BETWEEN ?1 AND ?2 ORDER BY ts",
            )?;
            let rows = stmt.query_map(params![from_ts, to_ts], |row| {
                Ok(json!({
                    "ts": row.get::<_, i64>(0)?,
                    "cpu_temp_c": row.get::<_, Option<f64>>(1)?,
                    "gpu_temp_c": row.get::<_, Option<f64>>(2)?,
                }))
            })?;
            rows.collect()
        }
        "battery" => {
            let mut stmt = conn.prepare(
                "SELECT ts, battery_pct, battery_status FROM snapshots WHERE ts BETWEEN ?1 AND ?2 ORDER BY ts",
            )?;
            let rows = stmt.query_map(params![from_ts, to_ts], |row| {
                Ok(json!({
                    "ts": row.get::<_, i64>(0)?,
                    "pct": row.get::<_, Option<f64>>(1)?,
                    "status": row.get::<_, Option<String>>(2)?,
                }))
            })?;
            rows.collect()
        }
        "network" => {
            if let Some(iface) = iface {
                let mut stmt = conn.prepare(
                    "SELECT snapshot_ts, rx_bytes_per_sec, tx_bytes_per_sec FROM net_if_snapshots
                     WHERE iface = ?1 AND snapshot_ts BETWEEN ?2 AND ?3 ORDER BY snapshot_ts",
                )?;
                let rows = stmt.query_map(params![iface, from_ts, to_ts], |row| {
                    Ok(json!({
                        "ts": row.get::<_, i64>(0)?,
                        "rx_bytes_per_sec": row.get::<_, i64>(1)?,
                        "tx_bytes_per_sec": row.get::<_, i64>(2)?,
                    }))
                })?;
                rows.collect()
            } else {
                let mut stmt = conn.prepare(
                    "SELECT ts, net_rx_bytes_per_sec, net_tx_bytes_per_sec FROM snapshots
                     WHERE ts BETWEEN ?1 AND ?2 ORDER BY ts",
                )?;
                let rows = stmt.query_map(params![from_ts, to_ts], |row| {
                    Ok(json!({
                        "ts": row.get::<_, i64>(0)?,
                        "rx_bytes_per_sec": row.get::<_, i64>(1)?,
                        "tx_bytes_per_sec": row.get::<_, i64>(2)?,
                    }))
                })?;
                rows.collect()
            }
        }
        "storage" => {
            let mount = mount.unwrap_or_default();
            let mut stmt = conn.prepare(
                "SELECT snapshot_ts, used_bytes, total_bytes, pct FROM disk_usage_snapshots
                 WHERE mount_point = ?1 AND snapshot_ts BETWEEN ?2 AND ?3 ORDER BY snapshot_ts",
            )?;
            let rows = stmt.query_map(params![mount, from_ts, to_ts], |row| {
                Ok(json!({
                    "ts": row.get::<_, i64>(0)?,
                    "used_bytes": row.get::<_, i64>(1)?,
                    "total_bytes": row.get::<_, i64>(2)?,
                    "pct": row.get::<_, f64>(3)?,
                }))
            })?;
            rows.collect()
        }
        _ => Ok(vec![]),
    }
}
