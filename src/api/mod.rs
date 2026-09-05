pub mod rest;
pub mod ws;

use crate::state::AppState;
use axum::routing::get;
use axum::Router;
use tower_http::compression::CompressionLayer;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

pub fn build_router(state: AppState) -> Router {
    let api = Router::new()
        .route("/health", get(rest::health))
        .route("/config", get(rest::config))
        .route("/snapshot", get(rest::snapshot))
        .route("/history", get(rest::history));

    let static_dir = &state.config.frontend.static_dir;
    let index_file = format!("{static_dir}/index.html");
    let serve_dir =
        ServeDir::new(static_dir).not_found_service(ServeFile::new(index_file));

    let mut router = Router::new()
        .nest("/api", api)
        .route("/ws", get(ws::ws_handler))
        .fallback_service(serve_dir)
        .layer(TraceLayer::new_for_http())
        .layer(CompressionLayer::new());

    // The Vite dev server proxies /api and /ws to this backend, so CORS
    // normally isn't exercised — this permissive layer is a debug-build-only
    // safety net for hitting the API directly from the Vite origin.
    if cfg!(debug_assertions) {
        router = router.layer(CorsLayer::permissive());
    }

    router.with_state(state)
}
