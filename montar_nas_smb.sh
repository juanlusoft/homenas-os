#!/bin/bash

# CONFIGURACIÓN
NAS_IP="192.168.1.182"     # Cambia esto si tu NAS tiene otra IP
NAS_SHARE="nas"            # Nombre del recurso compartido
MOUNTPOINT="/mnt/nas_remoto"
CREDENTIALS_FILE="/etc/samba/nas_credentials"

# Pedir usuario y contraseña
read -p "🔐 Usuario SMB (ej: nas): " SMB_USER
read -s -p "🔑 Contraseña SMB: " SMB_PASS
echo ""

# Crear punto de montaje si no existe
echo "📁 Creando punto de montaje en $MOUNTPOINT..."
sudo mkdir -p "$MOUNTPOINT"

# Crear archivo de credenciales
echo "📝 Creando archivo de credenciales en $CREDENTIALS_FILE..."
echo "username=$SMB_USER" | sudo tee "$CREDENTIALS_FILE" > /dev/null
echo "password=$SMB_PASS" | sudo tee -a "$CREDENTIALS_FILE" > /dev/null
sudo chmod 600 "$CREDENTIALS_FILE"

# Montar manualmente para probar
echo "🔌 Montando recurso SMB..."
sudo mount -t cifs "//$NAS_IP/$NAS_SHARE" "$MOUNTPOINT" -o credentials="$CREDENTIALS_FILE",iocharset=utf8,vers=3.0

# Añadir a /etc/fstab si no está ya
FSTAB_LINE="//$NAS_IP/$NAS_SHARE $MOUNTPOINT cifs credentials=$CREDENTIALS_FILE,iocharset=utf8,vers=3.0 0 0"
if ! grep -qs "$FSTAB_LINE" /etc/fstab; then
  echo "📄 Añadiendo entrada en /etc/fstab para montaje automático..."
  echo "$FSTAB_LINE" | sudo tee -a /etc/fstab > /dev/null
else
  echo "ℹ️ La entrada ya existe en /etc/fstab."
fi

echo "✅ Montaje completado. Puedes acceder en $MOUNTPOINT"
