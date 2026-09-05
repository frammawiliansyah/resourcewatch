# Resource Monitor

Lightweight system resource monitoring tool built with Rust (Axum backend) and React + TypeScript + Vite + Tailwind CSS (frontend).

Real-time streaming via WebSocket, persistent historical metric logging into SQLite, and embedded single-binary deployment.

---

## Features

- **Real-time Monitoring**: WebSocket stream (`/ws`) for live system metrics (CPU, RAM, GPU/NVML, Disk I/O, Storage, Network, Temperature, Battery, Processes).
- **Historical Metrics**: SQLite database storage with configurable retention policy and range queries (`/api/history`).
- **REST API**: Endpoints for health check, runtime config, and latest metric snapshot.
- **Single Port in Production**: Backend serves both the API and the compiled frontend static files on one port (default `8090`).
- **Configurable Runtime**: Custom port via CLI flags, environment variables, or config file.

---

## Tech Stack & Requirements

### Tech Stack
- **Backend**: Rust 2024 edition, Tokio, Axum, Sysinfo, NVML (NVIDIA), Rusqlite (SQLite)
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, uPlot, Lucide React

### Prerequisites
- **Rust toolchain** (cargo, rustc): `rustup` recommended
- **Node.js** (v18+) & **npm**
- **NVIDIA Driver / NVML** *(optional, for GPU metrics)*

---

## Project Structure

```
resource/
├── Cargo.toml               # Rust dependencies & config
├── config.toml              # Server, polling, retention, DB configuration
├── deploy/
│   ├── install.sh           # Automated systemd installer script
│   └── systemd/             # systemd service unit file
├── frontend/                # Vite + React + TypeScript web client
├── scripts/
│   ├── dev.sh               # Runner for development mode (hot reload)
│   └── prod.sh              # Runner for production build & process management
└── src/                     # Rust backend source
    ├── api/                 # REST & WebSocket endpoints
    ├── db/                  # SQLite storage & schema
    ├── metrics/             # Hardware collectors (CPU, RAM, GPU, etc.)
    ├── config.rs
    ├── main.rs
    ├── retention.rs         # Data retention & cleanup worker
    └── state.rs
```

---

## Configuration

### 1. Configuration File (`config.toml`)

```toml
[server]
bind_addr = "0.0.0.0"
port = 8090

[polling]
poll_interval_ms = 1000      # Real-time metrics tick rate
history_interval_secs = 10   # Interval to write snapshots to SQLite

[retention]
retention_days = 3           # History data retention period
cleanup_interval_secs = 3600 # Cleanup loop frequency

[database]
path = "data/history.db"

[frontend]
static_dir = "frontend/dist"
```

### 2. Environment Variables & Overrides

Configuration can be overridden at runtime without editing `config.toml`:

| Variable | Description | Default |
|---|---|---|
| `RM_PORT` | Port number to bind | `8090` |
| `RM_BIND_ADDR` | Bind address | `0.0.0.0` |
| `RM_CONFIG_PATH` | Path to custom config file | `config.toml` |
| `RM_POLL_INTERVAL_MS` | Metric polling tick in ms | `1000` |
| `RM_HISTORY_INTERVAL_SECS` | History snapshot write interval in seconds | `10` |
| `RM_RETENTION_DAYS` | Database retention in days | `3` |
| `RM_DB_PATH` | SQLite DB file path | `data/history.db` |
| `RM_STATIC_DIR` | Frontend static bundle directory | `frontend/dist` |

---

## Development Setup

In development mode:
- Backend runs on `http://localhost:8090`
- Frontend runs on `http://localhost:5173` with Vite HMR (proxies `/api` and `/ws` to backend)

### 1. Using Helper Script (Recommended)

```bash
# Start both backend and frontend dev servers
./scripts/dev.sh start

# Check status
./scripts/dev.sh status

# View logs
./scripts/dev.sh logs

# Stop dev servers
./scripts/dev.sh stop

# Restart dev servers
./scripts/dev.sh restart
```

### 2. Manual Development Setup

**Backend:**
```bash
cargo run
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

---

## Production Setup & Run

In production mode, the single Rust binary serves both API and static frontend assets on a single port.

### 1. Using Helper Script (`scripts/prod.sh`)

#### Build:
```bash
./scripts/prod.sh build
```
*(Runs `cargo build --release` and `npm run build`)*

#### Start / Run:
```bash
# Default port (8090)
./scripts/prod.sh start

# Custom port via flag (-p / --port)
./scripts/prod.sh start -p 10001
./scripts/prod.sh restart -p 10001

# Custom port via environment variable
RM_PORT=10001 ./scripts/prod.sh start

# Run in foreground (non-daemon)
./scripts/prod.sh run -p 10001
```

#### Process Management:
```bash
# Check status
./scripts/prod.sh status

# View logs (tail -f)
./scripts/prod.sh logs

# Restart
./scripts/prod.sh restart

# Stop
./scripts/prod.sh stop
```

---

### 2. Manual Build & Run

#### Step 1: Build Frontend
```bash
cd frontend
npm install
npm run build
cd ..
```

#### Step 2: Build Backend
```bash
cargo build --release
```

#### Step 3: Run Binary
```bash
# Default port from config.toml (8090)
./target/release/resource-monitor

# Custom port via environment variable
RM_PORT=10001 ./target/release/resource-monitor
```

Dashboard access: `http://localhost:10001` (or your configured port).

---

## Systemd Service Installation (Linux Server)

Deploy as background system service under `/opt/resource-monitor`:

```bash
sudo ./deploy/install.sh
```

### Manage Service:
```bash
sudo systemctl status resource-monitor
sudo systemctl restart resource-monitor
sudo systemctl stop resource-monitor
journalctl -u resource-monitor -f
```

### Change Port in Systemd Service:
Edit `/etc/systemd/system/resource-monitor.service` or `/opt/resource-monitor/config.toml`:
```ini
# Add Environment variable under [Service] section:
Environment=RM_PORT=10001
```
Then reload & restart:
```bash
sudo systemctl daemon-reload
sudo systemctl restart resource-monitor
```

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | `GET` | Health check and uptime |
| `/api/config` | `GET` | System config & hardware availability |
| `/api/snapshot` | `GET` | Latest full hardware metric snapshot |
| `/api/history` | `GET` | Query metric history (`?metric=cpu&range=1h`) |
| `/ws` | `WS` | Real-time WebSocket metric stream |
