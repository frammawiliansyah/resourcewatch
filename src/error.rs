use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

pub struct AppError(pub StatusCode, pub Value);

impl AppError {
    pub fn bad_request(msg: impl Into<String>) -> Self {
        Self(StatusCode::BAD_REQUEST, json!({ "error": msg.into() }))
    }

    pub fn internal(msg: impl Into<String>) -> Self {
        Self(
            StatusCode::INTERNAL_SERVER_ERROR,
            json!({ "error": msg.into() }),
        )
    }

    pub fn bad_request_with_mounts(msg: impl Into<String>, available_mounts: Vec<String>) -> Self {
        Self(
            StatusCode::BAD_REQUEST,
            json!({ "error": msg.into(), "available_mounts": available_mounts }),
        )
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (self.0, Json(self.1)).into_response()
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::internal(e.to_string())
    }
}
