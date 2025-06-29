#!/bin/bash
echo "Instalando HomeNAS OS..."
sudo apt update && sudo apt install -y curl wget git
echo "Clonando base CasaOS..."
git clone https://github.com/IceWhaleTech/CasaOS.git homenas-os-base
echo "Aplicando personalización de HomeLabs..."
# Aquí iría la lógica para reemplazar logos, nombres, configuración
echo "Instalación básica lista. Reinicia para continuar."
