#!/usr/bin/env bash
# Builds the release binary and installs resource-monitor as a systemd
# service under /opt/resource-monitor. Run from the repo root:
#   sudo ./deploy/install.sh
set -euo pipefail

INSTALL_DIR=/opt/resource-monitor
SERVICE_USER=resmon
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (sudo ./deploy/install.sh)" >&2
  exit 1
fi

echo "==> Building release binary"
runuser -u "${SUDO_USER:-$USER}" -- bash -c "cd '$REPO_ROOT' && cargo build --release"

echo "==> Building frontend"
runuser -u "${SUDO_USER:-$USER}" -- bash -c "cd '$REPO_ROOT/frontend' && npm install && npm run build"

echo "==> Creating service user"
id -u "$SERVICE_USER" &>/dev/null || useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"

echo "==> Installing to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR/frontend" "$INSTALL_DIR/data"
cp "$REPO_ROOT/target/release/resource-monitor" "$INSTALL_DIR/"
cp "$REPO_ROOT/config.toml" "$INSTALL_DIR/"
cp -r "$REPO_ROOT/frontend/dist" "$INSTALL_DIR/frontend/dist"
cp -r "$REPO_ROOT/scripts" "$INSTALL_DIR/scripts"
chmod +x "$INSTALL_DIR/scripts/prod.sh"
chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"

echo "==> Installing systemd unit"
cp "$REPO_ROOT/deploy/systemd/resource-monitor.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now resource-monitor

echo "==> Done. Check status with: systemctl status resource-monitor"
echo "    Logs: journalctl -u resource-monitor -f"
