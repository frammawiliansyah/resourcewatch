use crate::db;
use crate::error::AppError;
use crate::metrics::fans;
use crate::state::AppState;
use axum::Json;
use axum::extract::{ConnectInfo, Query, State};
use axum::http::{HeaderMap, header};
use serde::Deserialize;
use serde_json::{Value, json};
use std::net::SocketAddr;
use std::time::{SystemTime, UNIX_EPOCH};

pub async fn health(State(state): State<AppState>) -> Json<Value> {
    Json(json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
        "uptime_secs": state.start_time.elapsed().as_secs(),
    }))
}

pub async fn config(State(state): State<AppState>) -> Json<Value> {
    let gpu_available = state.latest.borrow().gpu.available;
    Json(json!({
        "poll_interval_ms": state.config.polling.poll_interval_ms,
        "history_interval_secs": state.config.polling.history_interval_secs,
        "retention_days": state.config.retention.retention_days,
        "bind_addr": state.config.server.bind_addr,
        "port": state.config.server.port,
        "gpu_available": gpu_available,
    }))
}

/// Fan RPM plus the firmware curve tables. Re-read from sysfs on every
/// request so curve changes made outside this process show up right away.
pub async fn fans() -> Json<Value> {
    Json(serde_json::to_value(fans::report()).unwrap_or(Value::Null))
}

#[derive(Debug, Deserialize)]
pub struct FanModeBody {
    pub mode: String,
}

/// The dashboard may also be published through a tunnel (e.g. Cloudflare),
/// whose requests arrive from loopback too, so the Host and Cloudflare
/// headers are checked as well as the peer address.
fn is_local_request(peer: SocketAddr, headers: &HeaderMap) -> bool {
    if !peer.ip().is_loopback() || headers.contains_key("cf-connecting-ip") {
        return false;
    }
    let Some(host) = headers.get(header::HOST).and_then(|h| h.to_str().ok()) else {
        return false;
    };
    let hostname = match host.strip_prefix('[') {
        Some(rest) => rest.split(']').next().unwrap_or(rest),
        None => host.split(':').next().unwrap_or(host),
    };
    matches!(hostname, "localhost" | "127.0.0.1" | "::1")
}

pub async fn set_fan_mode(
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(body): Json<FanModeBody>,
) -> Result<Json<Value>, AppError> {
    if !is_local_request(peer, &headers) {
        return Err(AppError::forbidden(
            "fan control is only available from localhost",
        ));
    }
    if !fans::FAN_MODES.contains(&body.mode.as_str()) {
        return Err(AppError::bad_request(format!(
            "unknown fan mode '{}', expected one of {:?}",
            body.mode,
            fans::FAN_MODES
        )));
    }

    tokio::task::spawn_blocking(move || fans::set_mode(&body.mode))
        .await
        .map_err(|e| AppError::internal(e.to_string()))?
        .map_err(AppError::internal)?;

    Ok(Json(
        serde_json::to_value(fans::report()).unwrap_or(Value::Null),
    ))
}

pub async fn snapshot(State(state): State<AppState>) -> Json<Value> {
    let snap = state.latest.borrow().clone();
    Json(serde_json::to_value(snap).unwrap_or(Value::Null))
}

#[derive(Debug, Deserialize)]
pub struct HistoryParams {
    pub metric: String,
    pub range: Option<String>,
    pub from: Option<i64>,
    pub to: Option<i64>,
    pub mount: Option<String>,
    pub iface: Option<String>,
}

const VALID_METRICS: &[&str] = &[
    "cpu",
    "ram",
    "gpu",
    "network",
    "diskio",
    "storage",
    "temperature",
    "battery",
];

fn range_to_millis(range: &str) -> Option<i64> {
    match range {
        "15m" => Some(15 * 60 * 1000),
        "1h" => Some(60 * 60 * 1000),
        "6h" => Some(6 * 60 * 60 * 1000),
        "24h" => Some(24 * 60 * 60 * 1000),
        "3d" => Some(3 * 24 * 60 * 60 * 1000),
        _ => None,
    }
}

pub async fn history(
    State(state): State<AppState>,
    Query(params): Query<HistoryParams>,
) -> Result<Json<Value>, AppError> {
    if !VALID_METRICS.contains(&params.metric.as_str()) {
        return Err(AppError::bad_request(format!(
            "unknown metric '{}', expected one of {:?}",
            params.metric, VALID_METRICS
        )));
    }

    let now_millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let (from_ts, to_ts) = match (params.from, params.to) {
        (Some(from), Some(to)) => (from, to),
        _ => {
            let range = params.range.as_deref().unwrap_or("1h");
            let span = range_to_millis(range)
                .ok_or_else(|| AppError::bad_request(format!("unknown range '{range}'")))?;
            (now_millis - span, now_millis)
        }
    };

    let db_path = state.config.database.path.clone();
    let metric = params.metric.clone();
    let mount = params.mount.clone();
    let iface = params.iface.clone();

    let (points, available_mounts) = tokio::task::spawn_blocking(move || {
        let conn = db::open(&db_path)?;

        if metric == "storage" && mount.is_none() {
            let mounts = db::available_mounts(&conn)?;
            return Ok::<_, rusqlite::Error>((vec![], Some(mounts)));
        }

        let points = db::query_history(
            &conn,
            &metric,
            from_ts,
            to_ts,
            mount.as_deref(),
            iface.as_deref(),
        )?;
        Ok((points, None))
    })
    .await
    .map_err(|e| AppError::internal(e.to_string()))??;

    if let Some(mounts) = available_mounts {
        return Err(AppError::bad_request_with_mounts(
            "mount param required",
            mounts,
        ));
    }

    Ok(Json(json!({
        "metric": params.metric,
        "range": params.range.unwrap_or_else(|| "1h".to_string()),
        "points": points,
    })))
}
