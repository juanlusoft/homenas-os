# HomeNas OS v3

PWA de gestión para NAS casero sobre Raspberry Pi CM5. Reemplaza la v2 monolítica con una arquitectura monorepo moderna.

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + TypeScript + Vite + TailwindCSS v4 + Zustand + React Router v7 + TanStack Query v5 |
| Backend | Fastify v5 + TypeScript + better-sqlite3 |
| Shared | `packages/shared` — Zod schemas como single source of truth |
| Auth | X-Session-Id header + CSRF token, RBAC admin/user, 2FA/TOTP |
| TLS | Certificado autofirmado, puerto 443, generado en install.sh |

---

## Estructura

```
homenas-os-v3/
├── apps/
│   ├── backend/          # Fastify API
│   └── frontend/         # React SPA
├── packages/
│   └── shared/           # Tipos y schemas Zod compartidos
├── install.sh            # Script de instalación para producción
├── uninstall.sh          # Script de desinstalación limpia
└── DEVLOG.md             # Registro de decisiones y cambios
```

---

## Módulos

| Módulo | Estado | Descripción |
|--------|--------|-------------|
| **Dashboard** | ✅ | CPU, RAM, red, temperatura, fans, potencia (polling 2s) |
| **Storage** | ✅ | Discos (lsblk + SMART), SnapRAID, MergerFS con caché NVMe, Badblocks |
| **Files** | ✅ | Explorador con árbol lateral, breadcrumb, subida drag & drop, validación MIME |
| **Docker** | ✅ | Contenedores, logs, variables de entorno, Compose stacks |
| **HomeStore** | ✅ | Tienda de apps Docker (18+ aplicaciones por categoría) |
| **Network** | ✅ | Interfaces, configuración IP (DHCP/estática), WireGuard (QR), Samba, NFS, DDNS, ancho de banda |
| **Syncthing** | ✅ | Sincronización P2P — dispositivos y carpetas vía API Syncthing |
| **Cloud Backup** | ✅ | Backup en nube con rclone (9+ proveedores: S3, GDrive, B2, Dropbox…) |
| **Active Backup** | ✅ | Backup pull-based con agente para Win/Mac/Linux, hardlinks, versiones |
| **Active Directory** | ✅ | Samba AD DC — usuarios, grupos y equipos CRUD |
| **Users** | ✅ | CRUD con RBAC admin/user, cambio de contraseña, 2FA por cuenta |
| **Backup** | ✅ | rsync/tar/rclone con historial de ejecuciones |
| **Scheduler** | ✅ | Tareas cron persistidas en SQLite, ejecución manual |
| **System** | ✅ | Info del sistema, actualizaciones OTA, UPS, toggle SSH, audit log, backup DB, integridad DB |

---

## Seguridad

### Autenticación
- Account lockout: 5 intentos fallidos en 15 minutos → bloqueo temporal (429)
- Idle session timeout: 8 horas de inactividad → sesión revocada
- Sliding session: la sesión se extiende 7 días en cada request
- CSRF token en todas las peticiones mutantes
- 2FA/TOTP compatible con Google Authenticator, Authy y similares

### Cabeceras y límites
- HSTS (1 año, includeSubDomains)
- Content Security Policy completa
- Rate limiting global (200 req/min) + por ruta sensible
- Body limit 1 MB (uploads tienen límite propio de 50 GB)

### Cifrado
- Secrets en DB (tokens DDNS, Cloudflare, SMTP, Telegram, cloud-backup) cifrados con AES-256-GCM
- Clave derivada de `/etc/machine-id` — única por máquina
- Token Cloudflare Tunnel en `EnvironmentFile` (no expuesto en `ps aux`)

### Validación de uploads
- Lista negra de extensiones: `.sh`, `.py`, `.js`, `.exe`, `.elf`, `.deb`…
- Comprobación de magic bytes: ELF, MZ/PE, shebang (`#!`), Mach-O

### Auditoría
- Tabla `audit_log` con todos los eventos relevantes: login, setup completado, reboot, CRUD usuarios, cambios de contraseña, activación/desactivación 2FA y SSH
- Endpoint paginado: `GET /api/system/audit-log` (solo admin)

### Contraseña inicial
Al primer arranque se genera una contraseña aleatoria impresa **una sola vez** en los logs:
```bash
journalctl -u homenas --no-pager | grep "FIRST RUN"
```
El wizard de setup obliga a cambiarla. La contraseña nueva debe tener mínimo 8 caracteres, una mayúscula y un número.

---

## Alertas externas

Configurables desde `Sistema → Alertas y notificaciones`:

- **Email (SMTP)**: compatible con Gmail, Outlook, Postfix local y cualquier servidor SMTP
- **Telegram Bot**: notificaciones instantáneas vía bot propio

Eventos que disparan alertas automáticas:
- Cuenta bloqueada por brute force
- 2FA activado o desactivado
- Inicio de sesión exitoso (opt-in)

---

## Setup Wizard

Al primer acceso, el wizard guía la configuración inicial en 6 pasos:

1. **Bienvenido** — presentación
2. **Cuenta** — cambio de usuario (mín. 5 chars) y contraseña (mín. 8 chars, 1 mayúscula, 1 número)
3. **Red** — DHCP o IP estática con autodetección de la interfaz activa
4. **Almacenamiento** — selección de discos, roles (datos/paridad/caché), tipo de pool (único/MergerFS/SnapRAID) y sistema de ficheros (ext4/xfs)
5. **Acceso externo** — Cloudflare Tunnel (opcional)
6. **Listo** — resumen y acceso al dashboard

El wizard hace autologin automático (sin pantalla de login). Una vez completado, el autologin queda bloqueado permanentemente incluso si se resetea el flag manualmente.

---

## Instalación en producción

```bash
curl -fsSL http://git.jlu.app/root/homenas-v3-os/-/raw/main/install.sh | sudo bash
```

El script:
- Instala Node.js, pnpm y dependencias del sistema
- Genera certificado TLS autofirmado en `/opt/homenas-v3/certs/`
- Compila el proyecto (`pnpm build`)
- Crea y activa el servicio systemd `homenas.service` en el puerto 443

Acceso tras la instalación: `https://<ip-del-nas>`

Obtener la contraseña generada en el primer arranque:
```bash
journalctl -u homenas --no-pager | grep "FIRST RUN"
```

---

## Desinstalación

```bash
curl -sSL http://git.jlu.app/root/homenas-v3-os/-/raw/main/uninstall.sh | sudo bash
```

El script:
- Para y elimina el servicio systemd `homenas.service`
- Borra `/opt/homenas-v3` (incluye base de datos y certificados TLS)
- Pide confirmación antes de borrar nada
- **No elimina** Node.js, pnpm ni git

---

## Desarrollo local

```bash
# Instalar dependencias
pnpm install

# Terminal 1 — backend (puerto 3000)
pnpm --filter @homenas/backend dev

# Terminal 2 — frontend (puerto 5173, proxy /api → 3000)
pnpm --filter @homenas/frontend dev
```

```bash
# Typecheck de todos los paquetes
pnpm -r typecheck
```

---

## Deploy en el NAS

```bash
sshpass -p '<password>' ssh juanlu@<ip> \
  "cd /opt/homenas-v3 && sudo -u homenas git pull && sudo -u homenas pnpm install && sudo -u homenas pnpm -r build && sudo systemctl restart homenas"
```

### Resetear el wizard (para pruebas)

> ⚠️ Solo resetea `setup_complete`. El autologin automático queda permanentemente bloqueado una vez que el setup se completó por primera vez.

```bash
python3 -c "
import sqlite3
conn = sqlite3.connect('/opt/homenas-v3/apps/backend/data/homenas.db')
conn.execute('DELETE FROM settings WHERE key=\"setup_complete\"')
conn.commit()
conn.close()
"
sudo systemctl restart homenas
```

---

## Flujo de almacenamiento (MergerFS + SnapRAID + caché)

```
Escritura → /mnt/storage (MergerFS)
                │
                ▼
         NVMe caché (/mnt/disks/cache1)   ← escrituras rápidas
                │
         05:00  rsync --remove-source-files → /mnt/disks/disk1 (HDD datos)
                │
         06:00  snapraid sync              → /mnt/parity1 (HDD paridad)
                │
         07:00  snapraid scrub (domingos)  → verificación integridad
```

El botón **"Crear tareas automáticas"** en la tarjeta SnapRAID crea estas 3 tareas en el Scheduler.
El botón **"Vaciar caché ahora"** en la tarjeta MergerFS permite el drenado manual.

---

## Changelog

Ver [DEVLOG.md](./DEVLOG.md) para el registro completo de decisiones, bugs y cambios.
