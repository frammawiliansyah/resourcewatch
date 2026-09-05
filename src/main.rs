mod api;
mod config;
mod db;
mod error;
mod metrics;
mod retention;
mod state;

use config::Config;
use state::AppState;
use std::time::{Duration, Instant};
use tokio::sync::{mpsc, watch};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let config = Config::load();
    tracing::info!(
        "starting resource-monitor on {}:{}",
        config.server.bind_addr,
        config.server.port
    );

    let mut collector = metrics::Collector::new();
    let first_snapshot = collector.tick();

    let (latest_tx, latest_rx) = watch::channel(first_snapshot);
    let (history_tx, history_rx) = mpsc::channel(32);

    retention::spawn_writer(
        config.database.path.clone(),
        config.retention.retention_days,
        config.retention.cleanup_interval_secs,
        history_rx,
    );

    let poll_interval_ms = config.polling.poll_interval_ms.max(100);
    let history_every_n_ticks =
        (config.polling.history_interval_secs * 1000 / poll_interval_ms).max(1);

    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(poll_interval_ms));
        let mut tick_count: u64 = 0;
        loop {
            interval.tick().await;
            let snapshot = collector.tick();
            tick_count += 1;

            if tick_count.is_multiple_of(history_every_n_ticks) {
                let _ = history_tx.try_send(snapshot.clone());
            }

            if latest_tx.send(snapshot).is_err() {
                break;
            }
        }
    });

    let state = AppState {
        config: std::sync::Arc::new(config.clone()),
        latest: latest_rx,
        start_time: Instant::now(),
    };

    let app = api::build_router(state);

    let addr = format!("{}:{}", config.server.bind_addr, config.server.port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("failed to bind {addr}: {e}"));
    tracing::info!("listening on {addr}");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server error");
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
    tracing::info!("shutdown signal received");
}
