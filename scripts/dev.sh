#!/usr/bin/env bash
# Development runner: backend (cargo run, auto-rebuild) + frontend (Vite dev
# server with HMR, proxying /api and /ws to the backend). Two ports in dev
# (backend :8090, frontend :5173). Use scripts/prod.sh for the single-port
# production build.
#
# Usage: ./scripts/dev.sh start|stop|restart|status|logs
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT/.run"
LOG_DIR="$ROOT/logs"
BACKEND_PID_FILE="$RUN_DIR/dev-backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/dev-frontend.pid"
BACKEND_LOG="$LOG_DIR/dev-backend.log"
FRONTEND_LOG="$LOG_DIR/dev-frontend.log"

mkdir -p "$RUN_DIR" "$LOG_DIR"

is_alive() {
  local pidfile="$1"
  [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null
}

start_one() {
  local label="$1" pidfile="$2" logfile="$3" workdir="$4" cmd="$5"
  if is_alive "$pidfile"; then
    echo "$label already running (pid $(cat "$pidfile"))"
    return
  fi
  rm -f "$pidfile"
  (
    cd "$workdir"
    # setsid makes this its own session/process-group leader, so `stop` can
    # kill the whole group (cargo/npm + the real child process they spawn)
    # with one signal instead of leaving orphans behind.
    setsid bash -c "$cmd" >"$logfile" 2>&1 </dev/null &
    echo $! >"$pidfile"
  )
  sleep 1
  if is_alive "$pidfile"; then
    echo "$label started (pid $(cat "$pidfile")), logs: $logfile"
  else
    echo "$label failed to start, check $logfile" >&2
    return 1
  fi
}

stop_one() {
  local label="$1" pidfile="$2"
  if ! is_alive "$pidfile"; then
    echo "$label not running"
    rm -f "$pidfile"
    return
  fi
  local pid
  pid="$(cat "$pidfile")"
  kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  for _ in $(seq 1 25); do
    is_alive "$pidfile" || break
    sleep 0.2
  done
  if is_alive "$pidfile"; then
    kill -KILL "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$pidfile"
  echo "$label stopped"
}

status_one() {
  local label="$1" pidfile="$2"
  if is_alive "$pidfile"; then
    echo "$label: running (pid $(cat "$pidfile"))"
  else
    echo "$label: stopped"
  fi
}

cmd="${1:-}"
case "$cmd" in
  start)
    start_one "backend " "$BACKEND_PID_FILE" "$BACKEND_LOG" "$ROOT" "cargo run"
    start_one "frontend" "$FRONTEND_PID_FILE" "$FRONTEND_LOG" "$ROOT/frontend" "npm run dev"
    echo
    echo "Backend:  http://127.0.0.1:${RW_PORT:-8090} (REST + WS)"
    echo "Frontend: http://127.0.0.1:5173 (HMR, proxies /api and /ws)"
    ;;
  stop)
    stop_one "frontend" "$FRONTEND_PID_FILE"
    stop_one "backend " "$BACKEND_PID_FILE"
    ;;
  restart)
    "$0" stop
    "$0" start
    ;;
  status)
    status_one "backend " "$BACKEND_PID_FILE"
    status_one "frontend" "$FRONTEND_PID_FILE"
    ;;
  logs)
    tail -n 50 -f "$BACKEND_LOG" "$FRONTEND_LOG"
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status|logs}" >&2
    exit 1
    ;;
esac
