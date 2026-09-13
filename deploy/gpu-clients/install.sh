#!/usr/bin/env bash
# Installs the optional Intel GPU per-process reader: a small, network-less
# root unit that summarises /proc/<pid>/fdinfo DRM usage into a file the
# unprivileged ResourceWatch service reads.
#
# Usage: cargo build --release && sudo ./deploy/gpu-clients/install.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "error: needs root. Re-run with: sudo $0" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BIN="$REPO_ROOT/target/release/resourcewatch-gpu-clients"

if [[ ! -x "$BIN" ]]; then
  echo "error: $BIN not found, run 'cargo build --release' first" >&2
  exit 1
fi

install -D -m 0755 "$BIN" /usr/local/libexec/resourcewatch-gpu-clients
install -m 0644 "$REPO_ROOT/deploy/gpu-clients/resourcewatch-gpu-clients.service" \
  /etc/systemd/system/resourcewatch-gpu-clients.service

systemctl daemon-reload
systemctl enable resourcewatch-gpu-clients.service
systemctl restart resourcewatch-gpu-clients.service

echo "gpu-clients installed: $(systemctl is-active resourcewatch-gpu-clients.service)"
