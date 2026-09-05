use crate::state::AppState;
use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::IntoResponse;

pub async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
    let mut rx = state.latest.clone();

    // Push the current value immediately so the client doesn't wait for the
    // next collector tick before seeing anything.
    let initial = rx.borrow().clone();
    if let Ok(text) = serde_json::to_string(&initial)
        && socket.send(Message::Text(text.into())).await.is_err()
    {
        return;
    }

    loop {
        tokio::select! {
            changed = rx.changed() => {
                if changed.is_err() {
                    break;
                }
                let snapshot = rx.borrow_and_update().clone();
                let Ok(text) = serde_json::to_string(&snapshot) else { continue };
                if socket.send(Message::Text(text.into())).await.is_err() {
                    break;
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(_)) => continue,
                    _ => break,
                }
            }
        }
    }
}
