use crate::db;
use crate::metrics::Snapshot;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::mpsc;

/// Owns the single write connection to SQLite. Runs on a dedicated blocking
/// thread: every history snapshot handed over the channel is inserted, and
/// after each insert we check whether enough wall-clock time has passed to
/// run the retention cleanup — serializing both on the same connection so
/// there's never write contention between them.
pub fn spawn_writer(
    db_path: String,
    retention_days: u32,
    cleanup_interval_secs: u64,
    mut rx: mpsc::Receiver<Snapshot>,
) {
    tokio::task::spawn_blocking(move || {
        let mut conn = match db::open(&db_path) {
            Ok(conn) => conn,
            Err(e) => {
                tracing::error!("failed to open database at {db_path}: {e}");
                return;
            }
        };

        let mut last_cleanup = Instant::now();
        run_cleanup(&conn, retention_days);

        while let Some(snapshot) = rx.blocking_recv() {
            if let Err(e) = db::insert_snapshot(&mut conn, &snapshot) {
                tracing::error!("failed to insert history snapshot: {e}");
            }

            if last_cleanup.elapsed().as_secs() >= cleanup_interval_secs {
                run_cleanup(&conn, retention_days);
                last_cleanup = Instant::now();
            }
        }
    });
}

fn run_cleanup(conn: &rusqlite::Connection, retention_days: u32) {
    let cutoff_millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
        - (retention_days as i64) * 86_400_000;

    match db::delete_older_than(conn, cutoff_millis) {
        Ok(()) => tracing::debug!("retention cleanup ran, cutoff_ts={cutoff_millis}"),
        Err(e) => tracing::error!("retention cleanup failed: {e}"),
    }
}
