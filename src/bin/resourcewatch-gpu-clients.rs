//! Root-side reader for Intel iGPU per-process usage.
//!
//! Per-client DRM usage lives in `/proc/<pid>/fdinfo`, which the kernel only
//! lets the owning user or a CAP_SYS_PTRACE holder read. This helper runs as a
//! separate, network-less systemd unit (see `deploy/gpu-clients`) and publishes
//! a summary file that the unprivileged ResourceWatch service reads.

use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const INTERVAL: Duration = Duration::from_secs(2);
const DRM_DEVICE_DIR: &str = "/dev/dri";
const INTEL_DRIVERS: &[&str] = &["i915"];
/// These hold other processes' DRM fds (logind hands the display device to
/// Xorg), so a client is only credited to them when nobody else holds it.
const FD_BROKERS: &[&str] = &["systemd", "systemd-logind"];

#[derive(Serialize)]
struct ClientProcess {
    pid: u32,
    name: String,
    util_pct: f32,
    mem_bytes: u64,
}

#[derive(Serialize)]
struct Report {
    ts: u64,
    processes: Vec<ClientProcess>,
}

struct Client {
    render_ns: u64,
    mem_bytes: u64,
    holders: Vec<(u32, String)>,
}

struct Fdinfo {
    key: String,
    render_ns: u64,
    mem_bytes: u64,
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn comm(pid: u32) -> String {
    fs::read_to_string(format!("/proc/{pid}/comm"))
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

/// `57961448116 ns`, `240176 KiB` or a bare number.
fn parse_amount(value: &str) -> u64 {
    let mut parts = value.split_whitespace();
    let n: u64 = parts.next().and_then(|n| n.parse().ok()).unwrap_or(0);
    match parts.next() {
        Some("KiB") => n << 10,
        Some("MiB") => n << 20,
        Some("GiB") => n << 30,
        _ => n,
    }
}

fn parse_fdinfo(text: &str) -> Option<Fdinfo> {
    let (mut driver, mut pdev, mut client_id) = (None, "", None);
    let (mut render_ns, mut mem_bytes) = (0, 0);
    for line in text.lines() {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let value = value.trim();
        match key {
            "drm-driver" => driver = Some(value),
            "drm-pdev" => pdev = value,
            "drm-client-id" => client_id = Some(value),
            "drm-engine-render" => render_ns = parse_amount(value),
            "drm-resident-system0" => mem_bytes = parse_amount(value),
            _ => {}
        }
    }
    if !INTEL_DRIVERS.contains(&driver?) {
        return None;
    }
    Some(Fdinfo {
        key: format!("{pdev}/{}", client_id?),
        render_ns,
        mem_bytes,
    })
}

/// DRM clients keyed by device + client id, since one client can be reachable
/// through several fds and processes.
fn scan() -> HashMap<String, Client> {
    let mut clients: HashMap<String, Client> = HashMap::new();
    let Ok(entries) = fs::read_dir("/proc") else {
        return clients;
    };
    for entry in entries.flatten() {
        let Some(pid) = entry
            .file_name()
            .to_str()
            .and_then(|s| s.parse::<u32>().ok())
        else {
            continue;
        };
        let Ok(fds) = fs::read_dir(entry.path().join("fd")) else {
            continue;
        };
        let mut name: Option<String> = None;
        for fd in fds.flatten() {
            if !fs::read_link(fd.path()).is_ok_and(|target| target.starts_with(DRM_DEVICE_DIR)) {
                continue;
            }
            let fdinfo_path = entry.path().join("fdinfo").join(fd.file_name());
            let Some(info) = fs::read_to_string(&fdinfo_path)
                .ok()
                .as_deref()
                .and_then(parse_fdinfo)
            else {
                continue;
            };
            let name = name.get_or_insert_with(|| comm(pid));
            let client = clients.entry(info.key).or_insert(Client {
                render_ns: 0,
                mem_bytes: 0,
                holders: Vec::new(),
            });
            client.render_ns = client.render_ns.max(info.render_ns);
            client.mem_bytes = client.mem_bytes.max(info.mem_bytes);
            if !client.holders.iter().any(|(p, _)| *p == pid) {
                client.holders.push((pid, name.clone()));
            }
        }
    }
    clients
}

fn owner(holders: &[(u32, String)]) -> Option<&(u32, String)> {
    holders
        .iter()
        .filter(|(_, name)| !FD_BROKERS.contains(&name.as_str()))
        .max_by_key(|(pid, _)| *pid)
        .or_else(|| holders.iter().max_by_key(|(pid, _)| *pid))
}

fn write_report(path: &Path, report: &Report) -> std::io::Result<()> {
    let tmp = path.with_extension("json.tmp");
    fs::write(
        &tmp,
        serde_json::to_vec(report).map_err(std::io::Error::other)?,
    )?;
    fs::rename(tmp, path)
}

fn main() {
    let dir = std::env::var_os("RUNTIME_DIRECTORY")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("/run/resourcewatch-gpu"));
    let out = dir.join("intel-clients.json");

    let mut prev = scan();
    let mut prev_at = Instant::now();
    loop {
        thread::sleep(INTERVAL);
        let current = scan();
        let elapsed_ns = prev_at.elapsed().as_nanos() as f64;
        prev_at = Instant::now();

        let mut per_pid: HashMap<u32, ClientProcess> = HashMap::new();
        for (key, client) in &current {
            let Some((pid, name)) = owner(&client.holders) else {
                continue;
            };
            let delta_ns = prev
                .get(key)
                .map_or(0, |p| client.render_ns.saturating_sub(p.render_ns));
            let entry = per_pid.entry(*pid).or_insert_with(|| ClientProcess {
                pid: *pid,
                name: name.clone(),
                util_pct: 0.0,
                mem_bytes: 0,
            });
            entry.util_pct += (delta_ns as f64 / elapsed_ns * 100.0) as f32;
            entry.mem_bytes += client.mem_bytes;
        }
        prev = current;

        let mut processes: Vec<ClientProcess> = per_pid
            .into_values()
            .filter(|p| p.util_pct > 0.0 || p.mem_bytes > 0)
            .map(|mut p| {
                p.util_pct = p.util_pct.min(100.0);
                p
            })
            .collect();
        processes.sort_by(|a, b| {
            b.util_pct
                .total_cmp(&a.util_pct)
                .then(b.mem_bytes.cmp(&a.mem_bytes))
        });

        let report = Report {
            ts: now_millis(),
            processes,
        };
        if let Err(e) = write_report(&out, &report) {
            eprintln!(
                "resourcewatch-gpu-clients: failed to write {}: {e}",
                out.display()
            );
        }
    }
}
