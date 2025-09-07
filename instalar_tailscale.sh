#!/usr/bin/env bash
set -euo pipefail

echo "=== Tailscale Subnet Router (Docker) - Instalación automática ==="

need() { command -v "$1" >/dev/null 2>&1 || { echo "Falta $1. Instálalo e inténtalo de nuevo."; exit 1; }; }
need docker
need sysctl

read -rp "➡️  Introduce tu Tailscale AUTH KEY (recomendado 'Reusable' + 'Preauthorized'): " TS_AUTHKEY
if [[ -z "${TS_AUTHKEY}" ]]; then echo "Auth key obligatorio."; exit 1; fi

read -rp "➡️  Hostname para este router (ej. minisforum): " TS_HOSTNAME
TS_HOSTNAME=${TS_HOSTNAME:-minisforum}

read -rp "➡️  Rutas a anunciar (CIDR, separadas por comas, ej. 192.168.1.0/24): " TS_ROUTES
if [[ -z "${TS_ROUTES}" ]]; then echo "Debes indicar al menos una subred en formato CIDR."; exit 1; fi

STATE_DIR="/var/lib/tailscale"

echo "→ Configurando reenvío de paquetes (IPv4/IPv6)..."
sudo mkdir -p /etc/sysctl.d
sudo tee /etc/sysctl.d/99-tailscale-router.conf >/dev/null <<EOF
net.ipv4.ip_forward=1
net.ipv6.conf.all.forwarding=1
EOF
sudo sysctl --system >/dev/null

if command -v nft >/dev/null 2>&1; then
  sudo nft add table inet tailscale 2>/dev/null || true
  sudo nft add chain inet tailscale forward { type filter hook forward priority 0\; policy accept\; } 2>/dev/null || true
fi

echo "→ Creando directorio de estado: ${STATE_DIR}"
sudo mkdir -p "${STATE_DIR}"
sudo chown root:root "${STATE_DIR}"

CONTAINER="tailscale"
if docker ps -a --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
  echo "→ Actualizando contenedor existente..."
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
fi

echo "→ Descargando e iniciando imagen 'tailscale/tailscale:stable'..."
docker run -d   --name ${CONTAINER}   --restart unless-stopped   --network host   --cap-add NET_ADMIN --cap-add NET_RAW   --device /dev/net/tun:/dev/net/tun   -v "${STATE_DIR}:/var/lib/tailscale"   -e TS_AUTHKEY="${TS_AUTHKEY}"   -e TS_HOSTNAME="${TS_HOSTNAME}"   -e TS_STATE_DIR="/var/lib/tailscale"   -e TS_ROUTES="${TS_ROUTES}"   tailscale/tailscale:stable

echo "→ Esperando a que el daemon arranque..."
sleep 4
docker logs --tail 50 ${CONTAINER} 2>/dev/null || true

cat <<'MSG'

✅ Hecho.

Siguientes pasos IMPORTANTES:
1) Abre https://login.tailscale.com/admin/machines
   - Localiza este equipo (hostname que pusiste).
   - Marca/autoriza “Use as subnet router” y aprueba las rutas anunciadas.

2) Desde el móvil (con Tailscale instalado y en la misma tailnet):
   - Podrás acceder directamente a IPs de tu LAN (p. ej. 192.168.1.100).

Comandos útiles:
  • Ver estado:     docker logs -f tailscale
  • Reiniciar:      docker restart tailscale
  • Cambiar rutas:  docker rm -f tailscale && (re-ejecuta este script)
  • Desinstalar:    docker rm -f tailscale && sudo rm -rf /var/lib/tailscale

MSG
