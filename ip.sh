#!/bin/bash

# Obtener la lista de interfaces de red disponibles
INTERFACES=($(ip -o link show | awk -F': ' '{print $2}' | grep -v 'lo'))

# Verificar si hay interfaces disponibles
if [ ${#INTERFACES[@]} -eq 0 ]; then
    echo "No se encontraron interfaces de red disponibles."
    exit 1
fi

# Mostrar las interfaces numeradas
echo "Interfaces de red disponibles:"
for i in "${!INTERFACES[@]}"; do
    echo "$((i+1)). ${INTERFACES[$i]}"
done

# Pedir al usuario que elija una interfaz
read -p "Selecciona el número de la interfaz que quieres configurar: " SELECCION

# Validar la entrada del usuario
if ! [[ "$SELECCION" =~ ^[0-9]+$ ]] || [ "$SELECCION" -lt 1 ] || [ "$SELECCION" -gt "${#INTERFACES[@]}" ]; then
    echo "Selección no válida."
    exit 1
fi

# Obtener el nombre de la interfaz seleccionada
INTERFACE="${INTERFACES[$((SELECCION-1))]}"
echo "Has seleccionado la interfaz: $INTERFACE"

# Pedir los datos de configuración
read -p "Introduce la dirección IP estática con máscara CIDR (ej. 192.168.1.100/24): " STATIC_IP
read -p "Introduce la puerta de enlace (ej. 192.168.1.1): " GATEWAY
read -p "Introduce los servidores DNS separados por espacio (ej. 1.1.1.1 8.8.8.8): " DNS

# Ruta del archivo de configuración de interfaces
CONFIG_FILE="/etc/network/interfaces"

# Hacer una copia de seguridad del archivo actual
cp $CONFIG_FILE ${CONFIG_FILE}.bak

# Escribir nueva configuración de red
cat <<EOF > $CONFIG_FILE
auto $INTERFACE
iface $INTERFACE inet static
    address $STATIC_IP
    gateway $GATEWAY
    dns-nameservers $DNS
EOF

# Reiniciar la interfaz de red para aplicar cambios
ip link set $INTERFACE down
ip link set $INTERFACE up

echo "Configuración aplicada. Comprueba la red con 'ip a'."

