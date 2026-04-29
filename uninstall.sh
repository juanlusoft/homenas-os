#!/usr/bin/env bash
set -euo pipefail

# ─── HomeNas OS v3 — Uninstall script ─────────────────────────────────────────
# Usage: curl -sSL http://git.jlu.app/root/homenas-v3-os/-/raw/main/uninstall.sh | sudo bash
# Removes: systemd service, /opt/homenas-v3, TLS certs
# Does NOT remove: Node.js, pnpm, git, apt packages

INSTALL_DIR="/opt/homenas-v3"
SERVICE_NAME="homenas"

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'
info()  { echo -e "${GREEN}[homenas]${NC} $*"; }
warn()  { echo -e "${YELLOW}[homenas]${NC} $*"; }
error() { echo -e "${RED}[homenas]${NC} $*" >&2; }

# ── Root check ────────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  error "Run as root: sudo bash uninstall.sh"
  exit 1
fi

# ── Confirm ───────────────────────────────────────────────────────────────────
warn "This will:"
warn "  - Stop and remove the ${SERVICE_NAME} systemd service"
warn "  - Delete ${INSTALL_DIR} (includes database and certificates)"
echo ""
read -rp "Are you sure? [y/N] " CONFIRM
if [[ "${CONFIRM,,}" != "y" ]]; then
  info "Aborted."
  exit 0
fi

# ── Stop and disable service ──────────────────────────────────────────────────
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  info "Stopping ${SERVICE_NAME}..."
  systemctl stop "$SERVICE_NAME"
fi

if systemctl is-enabled --quiet "$SERVICE_NAME" 2>/dev/null; then
  info "Disabling ${SERVICE_NAME}..."
  systemctl disable "$SERVICE_NAME"
fi

# ── Remove service file ───────────────────────────────────────────────────────
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
if [[ -f "$SERVICE_FILE" ]]; then
  info "Removing ${SERVICE_FILE}..."
  rm -f "$SERVICE_FILE"
  systemctl daemon-reload
fi

# ── Remove application directory ──────────────────────────────────────────────
if [[ -d "$INSTALL_DIR" ]]; then
  info "Removing ${INSTALL_DIR}..."
  rm -rf "$INSTALL_DIR"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
info ""
info "✓ HomeNas OS v3 desinstalado correctamente."
info "  Node.js, pnpm y git no han sido eliminados."
info ""
