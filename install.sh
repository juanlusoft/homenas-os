#!/usr/bin/env bash
set -euo pipefail

# ─── HomeNas OS v3 — Install script ───────────────────────────────────────────
# Usage: curl -sSL http://git.jlu.app/root/homenas-v3-os/-/raw/main/install.sh | bash
# Tested on: Raspberry Pi OS / Debian arm64, Node.js ≥ 18

REPO="http://git.jlu.app/root/homenas-v3-os.git"
INSTALL_DIR="/opt/homenas-v3"
SERVICE_NAME="homenas"
PORT=443
CERT_DIR="${INSTALL_DIR}/certs"
CERT_PATH="${CERT_DIR}/server.crt"
KEY_PATH="${CERT_DIR}/server.key"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${GREEN}[homenas]${NC} $*"; }
warn()  { echo -e "${YELLOW}[homenas]${NC} $*"; }
error() { echo -e "${RED}[homenas]${NC} $*" >&2; }

# Read version from package.json after clone/update (fallback hardcoded)
APP_VERSION="3.0.0"
get_version() {
  local pkg="${INSTALL_DIR}/package.json"
  if [[ -f "$pkg" ]]; then
    APP_VERSION=$(grep '"version"' "$pkg" | head -1 | sed 's/.*"version": *"\([^"]*\)".*/\1/')
  fi
}

# ── Root check ────────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  error "Run as root: sudo bash install.sh"
  exit 1
fi

# ── Node.js ───────────────────────────────────────────────────────────────────
info "Checking Node.js..."
if ! command -v node &>/dev/null; then
  info "Installing Node.js 22 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
NODE_VER=$(node -e "console.log(parseInt(process.versions.node))")
if (( NODE_VER < 18 )); then
  error "Node.js ≥ 18 required (found $(node --version))"
  exit 1
fi
info "Node.js $(node --version) OK"

# ── pnpm ─────────────────────────────────────────────────────────────────────
info "Checking pnpm..."
if ! command -v pnpm &>/dev/null; then
  info "Installing pnpm..."
  npm install -g pnpm
fi
info "pnpm $(pnpm --version) OK"

# ── Git ───────────────────────────────────────────────────────────────────────
if ! command -v git &>/dev/null; then
  info "Installing git..."
  apt-get install -y git
fi

# ── System dependencies ───────────────────────────────────────────────────────
info "Installing system dependencies..."
apt-get install -y --no-install-recommends \
  xfsprogs \
  e2fsprogs \
  parted \
  util-linux \
  udev \
  coreutils \
  samba \
  samba-vfs-modules \
  avahi-daemon \
  wsdd2

# ── Clone / update ────────────────────────────────────────────────────────────
if [[ -d "$INSTALL_DIR/.git" ]]; then
  info "Updating existing installation in $INSTALL_DIR..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  info "Cloning into $INSTALL_DIR..."
  git clone "$REPO" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
get_version
info "HomeNas OS v${APP_VERSION}"

# ── Install dependencies ──────────────────────────────────────────────────────
info "Installing dependencies..."
pnpm install --frozen-lockfile

# ── Build ─────────────────────────────────────────────────────────────────────
info "Building frontend and backend..."
NODE_ENV=production pnpm -r build

# ── Self-signed TLS certificate ───────────────────────────────────────────────
info "Generating self-signed TLS certificate..."
mkdir -p "$CERT_DIR"
if [[ ! -f "$CERT_PATH" || ! -f "$KEY_PATH" ]]; then
  # Use the interface that routes to the internet — avoids picking Docker/loopback IPs
  LOCAL_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1); exit}')
  LOCAL_IP=${LOCAL_IP:-$(hostname -I | awk '{print $1}')}
  openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout "$KEY_PATH" \
    -out "$CERT_PATH" \
    -days 3650 \
    -subj "/CN=homenas" \
    -addext "subjectAltName=IP:${LOCAL_IP},DNS:homenas,DNS:localhost" \
    2>/dev/null
  info "Certificate generated (valid 10 years)"
else
  info "Certificate already exists — skipping"
fi
chmod 600 "$KEY_PATH" "$CERT_PATH"

# ── Dedicated service user ────────────────────────────────────────────────────
info "Setting up homenas system user..."
if ! id homenas &>/dev/null; then
  useradd -r -s /usr/sbin/nologin -d "$INSTALL_DIR" -c "HomeNas OS service" homenas
fi
# Add to docker group so docker commands work without sudo
usermod -aG docker homenas 2>/dev/null || true

# Sudoers: homenas can run any command as root without password.
# Required for disk ops, mount, network config, service management, etc.
cat > /etc/sudoers.d/homenas <<'SUDOEOF'
homenas ALL=(root) NOPASSWD: ALL
SUDOEOF
chmod 440 /etc/sudoers.d/homenas

# Fix ownership so homenas can read/write/execute the install dir (including git ops)
chown -R homenas:homenas "$INSTALL_DIR"
chmod 750 "$CERT_DIR"

# Ensure git trusts this directory when run as homenas (or root via sudo)
git config --global --add safe.directory "$INSTALL_DIR" 2>/dev/null || true
sudo -u homenas git config --global --add safe.directory "$INSTALL_DIR" 2>/dev/null || true

# ── Systemd service ───────────────────────────────────────────────────────────
info "Creating systemd service..."
SERVER_JS="${INSTALL_DIR}/apps/backend/dist/apps/backend/src/server.js"
NODE_BIN=$(which node)

# Ensure data directory exists and is writable
mkdir -p "${INSTALL_DIR}/apps/backend/data"
chown homenas:homenas "${INSTALL_DIR}/apps/backend/data"

cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=HomeNas OS v3
After=network.target
Wants=network.target

[Service]
Type=simple
User=homenas
WorkingDirectory=${INSTALL_DIR}/apps/backend
ExecStart=${NODE_BIN} ${SERVER_JS}
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=${PORT}
Environment=CERT_PATH=${CERT_PATH}
Environment=KEY_PATH=${KEY_PATH}

# Allow binding to port 443 without root
AmbientCapabilities=CAP_NET_BIND_SERVICE
# CapabilityBoundingSet is intentionally omitted: homenas uses sudo (NOPASSWD:ALL) for
# privileged commands (lsblk, smartctl, mount, systemctl...). A bounding set that only
# allows CAP_NET_BIND_SERVICE blocks sudo's setuid/setgid syscalls and breaks all those calls.

# Systemd hardening (NoNewPrivileges omitted — OTA update needs sudo systemctl restart)
PrivateTmp=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
LockPersonality=yes
RestrictRealtime=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

# ── Network discovery (Mac Bonjour + Windows WSD) ────────────────────────────
info "Configuring network discovery..."

HOSTNAME_SHORT=$(hostname -s)

# ── Samba global config ───────────────────────────────────────────────────────
# Write a [global] section that gives the NAS a friendly name and ensures
# it appears in Mac Finder and Windows Explorer network browsers.
SMB_CONF=/etc/samba/smb.conf
if [[ ! -f "$SMB_CONF" ]] || ! grep -q '^\[global\]' "$SMB_CONF" 2>/dev/null; then
  cat > "$SMB_CONF" <<SMBEOF
[global]
   netbios name = HOMENAS
   server string = HomeNas OS
   workgroup = WORKGROUP
   security = user
   map to guest = bad user
   log level = 1
   max log size = 1000
   dns proxy = no
   server min protocol = SMB2
   server max protocol = SMB3

   # Performance
   socket options = TCP_NODELAY IPTOS_LOWDELAY
   use sendfile = yes
   aio read size = 16384
   aio write size = 16384

   # macOS / Finder compatibility (Fruit VFS)
   fruit:enabled = yes
   fruit:metadata = stream
   fruit:locking = netatalk
   fruit:posix_rename = yes
   vfs objects = catia fruit streams_xattr
SMBEOF
fi

systemctl enable smbd nmbd
systemctl restart smbd nmbd

# ── Avahi: advertise SMB so Mac Finder shows the NAS in the sidebar ───────────
mkdir -p /etc/avahi/services
cat > /etc/avahi/services/smb.service <<'AVAHIEOF'
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name replace-wildcards="yes">%h</name>
  <service>
    <type>_smb._tcp</type>
    <port>445</port>
  </service>
  <service>
    <type>_device-info._tcp</type>
    <port>0</port>
    <txt-record>model=RackMac</txt-record>
  </service>
</service-group>
AVAHIEOF

# Disable IPv6 publish if not needed (avoids avahi conflicts on some setups)
sed -i 's/^#use-ipv6=yes/use-ipv6=no/' /etc/avahi/avahi-daemon.conf 2>/dev/null || true

systemctl enable avahi-daemon
systemctl restart avahi-daemon

# ── wsdd2: Windows 10/11 WS-Discovery ────────────────────────────────────────
systemctl enable wsdd2
systemctl restart wsdd2

info "Network discovery enabled (Mac Bonjour + Windows WSD)"

# ── Done ──────────────────────────────────────────────────────────────────────
sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
  LOCAL_IP=$(hostname -I | awk '{print $1}')
  info ""
  info "✓ HomeNas OS v${APP_VERSION} instalado y funcionando"
  info ""
  info "  Dashboard: https://${LOCAL_IP}:${PORT}"
  info "  Usuario:   admin"
  info "  Password:  homenas1  (el wizard te pedirá cambiarla)"
  info ""
  info "  Logs:  journalctl -u ${SERVICE_NAME} -f"
  info "  Stop:  systemctl stop ${SERVICE_NAME}"
else
  error "El servicio no arrancó. Comprueba: journalctl -u ${SERVICE_NAME} -e"
  exit 1
fi
