#!/usr/bin/env bash
# Installs the optional fan-mode control for ASUS laptops (asus-wmi custom fan
# curves): a root guard that enforces the chosen mode, a fan-mode@ unit per
# mode, and a polkit rule letting the "resourcewatch" user start only those.
#
# Usage: sudo ./deploy/fan-control/install.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "error: needs root. Re-run with: sudo $0" >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install -m 0755 "$HERE/apply-fan-curve.sh" /usr/local/bin/apply-fan-curve.sh
install -m 0644 "$HERE/apply-fan-curve.service" /etc/systemd/system/apply-fan-curve.service
install -m 0644 "$HERE/fan-mode@.service" /etc/systemd/system/fan-mode@.service
install -m 0644 "$HERE/50-resourcewatch-fan-mode.rules" /etc/polkit-1/rules.d/50-resourcewatch-fan-mode.rules

systemctl daemon-reload
systemctl enable apply-fan-curve.service
systemctl restart apply-fan-curve.service

echo "fan control installed, current mode: $(cat /var/lib/fan-curve/mode 2>/dev/null || echo unknown)"
