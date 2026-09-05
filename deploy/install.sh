#!/usr/bin/env bash
# ResourceWatch one-time setup.
#
# Checks prerequisites, builds the release binary and the frontend bundle,
# installs both into a prefix, and registers a background service:
#
#   Linux  -> systemd unit, running as a dedicated "resourcewatch" system user
#   macOS  -> launchd LaunchAgent for the current user (no root needed)
#
# Usage:
#   ./deploy/install.sh [options]
#
# Options:
#   -p, --port PORT     Port to listen on            (default 8090)
#       --prefix DIR    Install directory            (Linux: /opt/resourcewatch,
#                                                     macOS: ~/.local/share/resourcewatch)
#       --no-service    Install files only, skip service registration
#       --uninstall     Stop, disable and remove an existing installation
#   -h, --help          Show this help
#
# Linux needs root (sudo) to create the service user and write the unit file.
# macOS must NOT be run with sudo — the agent is installed for your own user.
set -euo pipefail

APP=resourcewatch
SERVICE_USER=resourcewatch
LAUNCHD_LABEL=io.resourcewatch.agent
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PORT=8090
PREFIX=""
INSTALL_SERVICE=1
UNINSTALL=0

# ---------------------------------------------------------------- output ----

if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
  BOLD=""; RED=""; GREEN=""; YELLOW=""; DIM=""; RESET=""
fi

step() { echo "${BOLD}==>${RESET} $*"; }
info() { echo "    $*"; }
warn() { echo "${YELLOW}warning:${RESET} $*" >&2; }
die()  { echo "${RED}error:${RESET} $*" >&2; exit 1; }

usage() {
  cat <<'EOF'
ResourceWatch one-time setup.

Builds the release binary and frontend bundle, installs both into a prefix,
and registers a background service (systemd on Linux, launchd on macOS).

Usage:
  ./deploy/install.sh [options]

Options:
  -p, --port PORT     Port to listen on            (default 8090)
      --prefix DIR    Install directory            (Linux: /opt/resourcewatch,
                                                    macOS: ~/.local/share/resourcewatch)
      --no-service    Install files only, skip service registration
      --uninstall     Stop, disable and remove an existing installation
  -h, --help          Show this help

Linux needs root (sudo) to create the service user and write the unit file.
macOS must NOT be run with sudo -- the agent is installed for your own user.
EOF
}

# ------------------------------------------------------------------ args ----

while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--port)    PORT="${2:-}"; [[ -n "$PORT" ]] || die "--port needs a value"; shift 2 ;;
    --prefix)     PREFIX="${2:-}"; [[ -n "$PREFIX" ]] || die "--prefix needs a value"; shift 2 ;;
    --no-service) INSTALL_SERVICE=0; shift ;;
    --uninstall)  UNINSTALL=1; shift ;;
    -h|--help)    usage; exit 0 ;;
    *)            die "unknown option '$1' (try --help)" ;;
  esac
done

[[ "$PORT" =~ ^[0-9]+$ ]] && (( PORT > 0 && PORT < 65536 )) || die "invalid port '$PORT'"

# ------------------------------------------------------------  platform  ----

case "$(uname -s)" in
  Linux)  OS=linux ;;
  Darwin) OS=macos ;;
  *)      die "unsupported OS '$(uname -s)' — only Linux and macOS are supported" ;;
esac

if [[ -z "$PREFIX" ]]; then
  if [[ $OS == linux ]]; then
    PREFIX=/opt/$APP
  else
    PREFIX="$HOME/.local/share/$APP"
  fi
fi

# On Linux the service user and the unit file need root; on macOS a per-user
# LaunchAgent must NOT be installed as root or it would land in root's home.
if [[ $OS == linux && $INSTALL_SERVICE == 1 && $UNINSTALL == 0 && $EUID -ne 0 ]]; then
  die "Linux service install needs root — re-run with sudo:
       sudo ./deploy/install.sh --port $PORT"
fi
if [[ $OS == macos && $EUID -eq 0 ]]; then
  die "don't run this with sudo on macOS — the LaunchAgent installs into your own home"
fi

# The build must not run as root even when the install does, otherwise
# ~/.cargo and node_modules end up root-owned in the user's checkout.
BUILD_USER="${SUDO_USER:-$(id -un)}"
run_as_build_user() {
  if [[ $EUID -eq 0 && "$BUILD_USER" != root ]]; then
    runuser -u "$BUILD_USER" -- bash -lc "$1"
  else
    bash -lc "$1"
  fi
}

PLIST_DEST="$HOME/Library/LaunchAgents/$LAUNCHD_LABEL.plist"

# ------------------------------------------------------------- uninstall ----

if [[ $UNINSTALL == 1 ]]; then
  step "Uninstalling $APP"
  if [[ $OS == linux ]]; then
    [[ $EUID -eq 0 ]] || die "uninstall needs root — re-run with sudo:
       sudo ./deploy/install.sh --uninstall"
    if systemctl list-unit-files "$APP.service" >/dev/null 2>&1; then
      systemctl disable --now "$APP" 2>/dev/null || true
    fi
    rm -f "/etc/systemd/system/$APP.service"
    systemctl daemon-reload 2>/dev/null || true
  else
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
    rm -f "$PLIST_DEST"
  fi
  info "service removed"
  info "install dir left in place (contains your database): $PREFIX"
  info "remove it manually with: rm -rf '$PREFIX'"
  exit 0
fi

# ---------------------------------------------------------- prerequisites ---

step "Checking prerequisites"

missing=()
command -v cargo >/dev/null 2>&1 || missing+=("Rust toolchain (cargo) — https://rustup.rs")
command -v npm   >/dev/null 2>&1 || missing+=("Node.js + npm (v18 or newer) — https://nodejs.org")
if (( ${#missing[@]} )); then
  echo "${RED}Missing required tooling:${RESET}" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

node_major="$(node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/')"
if [[ -n "$node_major" ]] && (( node_major < 18 )); then
  die "Node.js v18+ required, found v$node_major"
fi

info "cargo $(cargo --version | awk '{print $2}'), node $(node -v), npm v$(npm -v)"

if [[ $OS == linux ]] && ! command -v systemctl >/dev/null 2>&1 && [[ $INSTALL_SERVICE == 1 ]]; then
  warn "systemd not detected — installing files only (--no-service)"
  INSTALL_SERVICE=0
fi

# A port that's already taken makes the service crash-loop after install,
# which is a confusing first-run experience — catch it up front instead.
if command -v ss >/dev/null 2>&1; then
  ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$PORT\$" && warn "port $PORT already appears to be in use"
elif command -v lsof >/dev/null 2>&1; then
  lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && warn "port $PORT already appears to be in use"
fi

# ----------------------------------------------------------------- build ----

step "Building release binary"
run_as_build_user "cd '$REPO_ROOT' && cargo build --release"

step "Building frontend bundle"
run_as_build_user "cd '$REPO_ROOT/frontend' && npm ci --no-audit --no-fund || npm install --no-audit --no-fund"
run_as_build_user "cd '$REPO_ROOT/frontend' && npm run build"

[[ -x "$REPO_ROOT/target/release/$APP" ]] || die "build finished but $REPO_ROOT/target/release/$APP is missing"
[[ -f "$REPO_ROOT/frontend/dist/index.html" ]] || die "frontend build finished but frontend/dist/index.html is missing"

# --------------------------------------------------------------- install ----

step "Installing to $PREFIX"
mkdir -p "$PREFIX/frontend" "$PREFIX/data" "$PREFIX/logs"
install -m 0755 "$REPO_ROOT/target/release/$APP" "$PREFIX/$APP"
rm -rf "$PREFIX/frontend/dist"
cp -R "$REPO_ROOT/frontend/dist" "$PREFIX/frontend/dist"

# Never clobber an existing config — an upgrade must keep the operator's edits.
if [[ -f "$PREFIX/config.toml" ]]; then
  info "keeping existing config.toml (new default saved as config.toml.new)"
  cp "$REPO_ROOT/config.toml" "$PREFIX/config.toml.new"
else
  cp "$REPO_ROOT/config.toml" "$PREFIX/config.toml"
  # Point the installed config at the install-local paths and chosen port.
  sed -i.bak \
    -e "s|^port = .*|port = $PORT|" \
    -e "s|^path = .*|path = \"$PREFIX/data/history.db\"|" \
    -e "s|^static_dir = .*|static_dir = \"$PREFIX/frontend/dist\"|" \
    "$PREFIX/config.toml"
  rm -f "$PREFIX/config.toml.bak"
fi

if [[ $INSTALL_SERVICE == 0 ]]; then
  step "Done (files only, no service registered)"
  info "run it with: cd '$PREFIX' && ./$APP"
  exit 0
fi

# --------------------------------------------------------------- service ----

if [[ $OS == linux ]]; then
  step "Creating service user '$SERVICE_USER'"
  if id -u "$SERVICE_USER" >/dev/null 2>&1; then
    info "already exists"
  else
    useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
    info "created"
  fi
  chown -R "$SERVICE_USER":"$SERVICE_USER" "$PREFIX"

  step "Installing systemd unit"
  unit=/etc/systemd/system/$APP.service
  sed -e "s|^#\?Environment=RW_PORT=.*|Environment=RW_PORT=$PORT|" \
      -e "s|/opt/$APP|$PREFIX|g" \
      "$REPO_ROOT/deploy/systemd/$APP.service" > "$unit"
  chmod 0644 "$unit"
  systemctl daemon-reload
  systemctl enable --now "$APP"
  sleep 1

  if systemctl is-active --quiet "$APP"; then
    step "${GREEN}ResourceWatch is running${RESET}"
  else
    warn "service did not become active — inspect with: journalctl -u $APP -n 50"
  fi
  info "Dashboard: ${BOLD}http://localhost:$PORT${RESET}"
  echo
  info "${DIM}status  : sudo systemctl status $APP${RESET}"
  info "${DIM}logs    : journalctl -u $APP -f${RESET}"
  info "${DIM}restart : sudo systemctl restart $APP${RESET}"
  info "${DIM}config  : $PREFIX/config.toml${RESET}"
  info "${DIM}remove  : sudo ./deploy/install.sh --uninstall${RESET}"
else
  step "Installing launchd agent"
  mkdir -p "$HOME/Library/LaunchAgents"
  sed -e "s|__PREFIX__|$PREFIX|g" -e "s|__PORT__|$PORT|g" \
      "$REPO_ROOT/deploy/launchd/$LAUNCHD_LABEL.plist" > "$PLIST_DEST"

  launchctl unload "$PLIST_DEST" 2>/dev/null || true
  launchctl load "$PLIST_DEST"
  sleep 1

  if launchctl list | grep -q "$LAUNCHD_LABEL"; then
    step "${GREEN}ResourceWatch is running${RESET}"
  else
    warn "agent did not start — inspect $PREFIX/logs/resourcewatch.err.log"
  fi
  info "Dashboard: ${BOLD}http://localhost:$PORT${RESET}"
  echo
  info "${DIM}status  : launchctl list | grep $LAUNCHD_LABEL${RESET}"
  info "${DIM}logs    : tail -f $PREFIX/logs/resourcewatch.log${RESET}"
  info "${DIM}restart : launchctl kickstart -k gui/\$UID/$LAUNCHD_LABEL${RESET}"
  info "${DIM}config  : $PREFIX/config.toml${RESET}"
  info "${DIM}remove  : ./deploy/install.sh --uninstall${RESET}"
fi
