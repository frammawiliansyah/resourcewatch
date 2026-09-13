//! Intel iGPU per-process usage.
//!
//! `/proc/<pid>/fdinfo` isn't readable from this unprivileged service, so the
//! numbers come from the `resourcewatch-gpu-clients` helper (see
//! `deploy/gpu-clients`). Without the helper this simply reports unavailable.

use crate::metrics::gpu::GpuProcess;
use serde::{Deserialize, Serialize};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

const CLIENTS_FILE: &str = "/run/resourcewatch-gpu/intel-clients.json";

/// The helper rewrites the file every 2s; anything older means it stopped.
const MAX_AGE_MS: u64 = 6_000;

#[derive(Deserialize)]
struct Report {
    ts: u64,
    processes: Vec<GpuProcess>,
}

#[derive(Debug, Clone, Serialize)]
pub struct IntelGpuInfo {
    pub available: bool,
    pub processes: Vec<GpuProcess>,
}

pub fn collect() -> IntelGpuInfo {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let report = fs::read(CLIENTS_FILE)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Report>(&bytes).ok())
        .filter(|r| now.saturating_sub(r.ts) <= MAX_AGE_MS);

    match report {
        Some(r) => IntelGpuInfo {
            available: true,
            processes: r.processes,
        },
        None => IntelGpuInfo {
            available: false,
            processes: Vec::new(),
        },
    }
}
