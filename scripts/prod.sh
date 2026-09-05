#!/usr/bin/env bash
# Production runner: builds the release binary + frontend bundle and runs
# the single compiled binary, which serves the REST/WS API and the built
# frontend on ONE port (no separate frontend server in production).
#
# If the "resource-monitor" systemd unit is already installed (see
# deploy/install.sh), start/stop/restart/status/logs transparently delegate
# to systemctl/journalctl instead of managing the process directly — so the
# same `./scripts/prod.sh start|stop|status` works whether or not the
# service has been installed under systemd yet.
#
# Usage: ./scripts/prod.sh build|start|stop|restart|status|logs|run [-p PORT]
#   run  — foreground, no daemonizing; this is what the systemd unit's
#          ExecStart invokes (see deploy/systemd/resource-monitor.service).
set -euo pipefail

# Parse optional -p / --port flag
ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--port)
      export RM_PORT="$2"
      shift 2
      ;;
    *)
      ARGS+=("$1")
      shift
      ;;
  esac
done
set -- "${ARGS[@]}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.run"
LOG_DIR="$ROOT/logs"
PID_FILE="$RUN_DIR/prod.pid"
LOG_FILE="$LOG_DIR/prod.log"
SERVICE_NAME="resource-monitor"
FRONTEND_DIST="$ROOT/frontend/dist"

mkdir -p "$RUN_DIR" "$LOG_DIR"

# Resolves to the repo's debug/release layout (target/release/...) in a dev
# checkout, or the flat layout deploy/install.sh copies into /opt/resource-monitor.
resolve_bin() {
  if [[ -x "$ROOT/target/release/resource-monitor" ]]; then
    echo "$ROOT/target/release/resource-monitor"
  elif [[ -x "$ROOT/resource-monitor" ]]; then
    echo "$ROOT/resource-monitor"
  else
    echo "$ROOT/target/release/resource-monitor"
  fi
}

build() {
  echo "==> Building backend (release)"
  (cd "$ROOT" && cargo build --release)
  echo "==> Building frontend"
  (cd "$ROOT/frontend" && npm install && npm run build)
  echo "==> Build complete: $(resolve_bin)"
}

ensure_built() {
  local bin
  bin="$(resolve_bin)"
  if [[ ! -x "$bin" || ! -f "$FRONTEND_DIST/index.html" ]]; then
    echo "Release build not found, building now..."
    build
  fi
}

is_alive() {
  [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

systemd_installed() {
  command -v systemctl >/dev/null 2>&1 &&
    systemctl list-unit-files "${SERVICE_NAME}.service" 2>/dev/null | grep -q "${SERVICE_NAME}\.service"
}

standalone_start() {
  ensure_built
  if is_alive; then
    echo "already running (pid $(cat "$PID_FILE"))"
    return
  fi
  rm -f "$PID_FILE"
  local bin
  bin="$(resolve_bin)"
  (
    cd "$ROOT"
    setsid "$bin" >"$LOG_FILE" 2>&1 </dev/null &
    echo $! >"$PID_FILE"
  )
  sleep 1
  if is_alive; then
    local port="${RM_PORT:-$(grep -A3 '^\[server\]' "$ROOT/config.toml" 2>/dev/null | grep '^port' | grep -o '[0-9]\+' | head -1)}"
    echo "started (pid $(cat "$PID_FILE")) — http://127.0.0.1:${port:-8090}"
    echo "logs: $LOG_FILE"
  else
    echo "failed to start, see $LOG_FILE" >&2
    exit 1
  fi
}

standalone_stop() {
  if ! is_alive; then
    echo "not running"
    rm -f "$PID_FILE"
    return
  fi
  local pid
  pid="$(cat "$PID_FILE")"
  kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 1 25); do
    is_alive || break
    sleep 0.2
  done
  if is_alive; then
    kill -KILL "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  echo "stopped"
}

standalone_status() {
  if is_alive; then
    echo "running (pid $(cat "$PID_FILE"))"
  else
    echo "stopped"
  fi
}

cmd="${1:-}"
case "$cmd" in
  build)
    build
    ;;
  run)
    # Foreground, for systemd's ExecStart — fails fast instead of building
    # under supervision; run '$0 build' first if the binary is missing.
    bin="$(resolve_bin)"
    if [[ ! -x "$bin" ]]; then
      echo "release binary not found at $bin — run '$0 build' first" >&2
      exit 1
    fi
    cd "$ROOT"
    exec "$bin"
    ;;
  start)
    if systemd_installed; then
      echo "Managed by systemd — delegating to systemctl"
      sudo systemctl start "$SERVICE_NAME"
      systemctl status "$SERVICE_NAME" --no-pager
    else
      standalone_start
    fi
    ;;
  stop)
    if systemd_installed; then
      sudo systemctl stop "$SERVICE_NAME"
    else
      standalone_stop
    fi
    ;;
  restart)
    if systemd_installed; then
      sudo systemctl restart "$SERVICE_NAME"
    else
      standalone_stop
      standalone_start
    fi
    ;;
  status)
    if systemd_installed; then
      systemctl status "$SERVICE_NAME" --no-pager
    else
      standalone_status
    fi
    ;;
  logs)
    if systemd_installed; then
      journalctl -u "$SERVICE_NAME" -f
    else
      tail -n 100 -f "$LOG_FILE"
    fi
    ;;
  *)
    echo "Usage: $0 {build|start|stop|restart|status|logs}" >&2
    echo "  build   cargo build --release + npm run build" >&2
    echo "  start   run the release binary (single port, FE+BE together)" >&2
    echo "          — delegates to systemctl if the systemd unit is installed" >&2
    exit 1
    ;;
esac
