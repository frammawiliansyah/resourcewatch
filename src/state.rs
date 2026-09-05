use crate::config::Config;
use crate::metrics::Snapshot;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::watch;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub latest: watch::Receiver<Snapshot>,
    pub start_time: Instant,
}
