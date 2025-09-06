#!/bin/bash

# Variables
PORT_WEB=12838
INSTALL_DIR=/opt/AdGuardHome
TMP_DIR=/tmp/adguard_install

echo "🔧 Instalando AdGuard Home en el puerto $PORT_WEB..."

# 1. Descargar AdGuard Home
mkdir -p "$TMP_DIR"
cd "$TMP_DIR"
wget https://static.adguard.com/adguardhome/release/AdGuardHome_linux_amd64.tar.gz -O AdGuardHome.tar.gz

# 2. Extraer
tar -xzf AdGuardHome.tar.gz
cd AdGuardHome

# 3. Instalar
sudo ./AdGuardHome -s install

# 4. Esperar que genere el archivo de configuración
sleep 3

# 5. Modificar el archivo de configuración para poner el puerto deseado
CONFIG_FILE="$INSTALL_DIR/AdGuardHome.yaml"
if [ -f "$CONFIG_FILE" ]; then
    echo "📝 Modificando puerto web en $CONFIG_FILE..."
    sudo sed -i "s/address: .*/address: 0.0.0.0:$PORT_WEB/" "$CONFIG_FILE"
    sudo systemctl restart AdGuardHome
else
    echo "❌ No se encontró el archivo de configuración. ¿La instalación falló?"
    exit 1
fi

# 6. Mostrar estado
echo "✅ AdGuard Home instalado y funcionando en el puerto $PORT_WEB"
echo "🌐 Accede en: http://<IP_DEL_EQUIPO>:$PORT_WEB"
