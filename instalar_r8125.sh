#!/bin/bash
set -e

echo "🔧 Instalando dependencias necesarias..."
sudo apt update
sudo apt install -y dkms build-essential linux-headers-$(uname -r) git

echo "⬇️ Clonando repositorio oficial del driver r8125..."
cd /tmp
rm -rf realtek-r8125-dkms
git clone https://github.com/awesometic/realtek-r8125-dkms.git
cd realtek-r8125-dkms

echo "⚙️ Instalando el driver mediante DKMS..."
sudo ./dkms-install.sh

echo "⛔ Bloqueando el driver r8169 para evitar conflictos..."
echo "blacklist r8169" | sudo tee /etc/modprobe.d/blacklist-r8169.conf

echo "🧱 Actualizando initramfs..."
sudo update-initramfs -u

echo "✅ Instalación completada con éxito."

read -p "🔁 ¿Quieres reiniciar ahora para aplicar los cambios? [s/N]: " resp
if [[ "$resp" =~ ^[sS]$ ]]; then
  sudo reboot
else
  echo "ℹ️ Reinicia manualmente cuando estés listo: sudo reboot"
fi
