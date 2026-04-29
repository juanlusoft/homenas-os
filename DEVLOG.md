# HomeNas OS v3 — DEVLOG

## Convenciones
- Cada entrada tiene fecha, fase y descripción
- Se documentan bugs, soluciones, decisiones de arquitectura y cambios

---

## 2026-04-16 — v3.7.16: Active Backup — restaurar archivos + añadir dispositivo desde UI

### Restaurar archivos (#4)
- `FileBrowser`: nueva columna "Acciones" con botón de descarga por cada archivo
- `activeBackupApi.downloadRestoreFile(id, version, path)`: descarga con token de sesión
- Estado de carga por archivo individual (no bloquea el resto de la tabla)

### Añadir dispositivo desde UI (#5)
- `POST /api/active-backup/devices` (admin): crea dispositivo pre-aprobado sin necesitar el agente
- `useCreateDevice()`: mutation hook, invalida `['ab-devices']` al completar
- `AddDeviceModal`: formulario con nombre, hostname opcional y selector de OS (Windows/Linux/macOS)
- Al crear → abre automáticamente el modal de descarga del agente para el nuevo dispositivo
- Botón "Añadir dispositivo" en la cabecera de la vista junto al botón de refresco

---

## 2026-04-16 — v3.7.15: Active Backup — instalación zero-config (ZIP pre-configurado)

### Frontend
- `AgentInstructionsModal`: reemplaza el modal legacy con tres botones de descarga (Windows / Linux / macOS)
- `activeBackupApi.downloadAgentPackage(id, platform, name)`: descarga ZIP pre-configurado con binario + config
- Eliminados `CopyButton`, `DownloadButton` y `_AgentInstructionsModalLegacy` (ya no necesarios)

### Backend — nuevo endpoint
- `GET /devices/:id/agent-package?platform=windows|linux|mac`
  - Lee el binario compilado de `apps/agent/build/`
  - Detecta la URL del NAS automáticamente desde las cabeceras HTTP (`x-forwarded-proto`, `host`)
  - Genera `homenas-agent.json` pre-configurado con `nas_url`, `token`, `device_name`, `backup_paths`
  - Empaqueta todo en un ZIP: binario + config + script de instalación + LEEME.txt
  - Windows: incluye `instalar.cmd` (ejecutar como Admin)
  - Linux/Mac: incluye `instalar.sh` (ejecutar con sudo)

### Agente Go — auto-install sin flags
- Cuando se ejecuta sin argumentos, `autoInstall()` lee `homenas-agent.json` del mismo directorio
- Instala el servicio de sistema (Windows SCM / systemd / launchd) completamente en silencio
- El usuario solo hace doble-click en el `.exe` (o ejecuta el script) — no hay flags ni configuración manual
- Errores en Windows mostrados con `MessageBox` (sin consola, ya que usa `-H windowsgui`)

---

## 2026-04-16 — v3.7.13: Active Backup push-agent — arquitectura Synology-like

### Agente Go (apps/agent/)
- Binario único sin dependencias: `homenas-agent.exe` (6.6 MB Windows), Linux y Mac
- Instalación silenciosa: `homenas-agent.exe --install --nas http://IP:3001`
  - Windows: Windows Service via SCM (invisible, sin icono, sin tray, autostart)
  - Linux: systemd unit file (`homenas-agent.service`)
  - macOS: launchd plist (`io.homenas.agent`)
- VSS (Volume Shadow Copy) en Windows para backups consistentes con archivos abiertos
- Primera copia: sube todo. Incrementales: solo archivos con hash distinto
- Deduplica via `file-check` antes de subir — el NAS hardlinkea archivos sin cambios
- Manifest local en `%APPDATA%\HomeNas\manifest.json` para comparaciones rápidas

### Backend NAS — nuevos endpoints
- `POST /agent/backup/begin` — crea sesión de backup (auth por token)
- `POST /agent/backup/file-check` — dedup check contra manifest versión anterior
- `POST /agent/backup/file` — recibe chunks de 4MB via multipart
- `POST /agent/backup/end` — finaliza: hardlinks + manifest + symlink latest + poda
- `PATCH /devices/:id` — editar hostname, backup_paths, schedule_cron, retention_days
- `GET /devices/:id/restore/browse` — navega versión por manifest
- `GET /devices/:id/restore/download` — descarga archivo individual para restaurar

### DB migration v4
- `ab_devices.backup_paths` (JSON array de rutas)
- `ab_sessions` table (sesiones de backup activas, expiran en 24h)

### Shared types
- `ManifestEntry`, `BackupBeginRequest/Response`, `FileCheckRequest/Response`
- `BackupEndRequest`, `UpdateDeviceInput`

---

## 2026-04-16 — v3.7.12: Active Backup — stats bar, dot online y labels en español

- Añadida barra de stats (Dispositivos / En línea / Pendientes / Último backup) encima de la grid
- Dot de online por tarjeta: verde (< 5 min), amarillo (< 1h), rojo (> 1h), con tooltip de fecha exacta
- Resultado del último backup con badge ✓ OK / ✗ Error junto a la fecha
- Labels de las tarjetas traducidos al español (Último backup, Última conexión, Retención, Programación)

---

## 2026-04-16 — v3.7.11: botón descargar agente en Active Backup

- Añadido componente `DownloadButton` en `ActiveBackupView.tsx`
- Descarga el script `homenas-agent.sh` como fichero `.sh` con `Blob + createObjectURL`
- Aparece junto al botón de copiar en el modal "Connect Agent"

---

## 2026-04-16 — v3.7.10: fix Active Backup crash (listDevices devuelve {items,total})

- `api/active-backup.ts`: `listDevices()` tipado como `AbDevice[]` pero el backend devuelve `{items: AbDevice[], total: number}`
- El componente fallaba al intentar `.map()` sobre un objeto en lugar de un array
- Fix: `.then(r => r.items)` para extraer el array antes de devolver al componente

---

## 2026-04-16 — v3.7.9: logo Homelabs Club en sidebar

- `logo.svg` copiado de v2 a `apps/frontend/public/`
- Añadido al fondo del sidebar, antes de los controles de usuario, con opacidad reducida y hover
- Se adapta al estado colapsado/expandido del sidebar

---

## 2026-04-16 — v3.7.8: eliminar BandwidthChart de Network

- Eliminado `BandwidthChart` de `NetworkView.tsx` — no aportaba información útil

---

## 2026-04-16 — v3.7.7: fix nmcli sin sudo en configureNetwork

- `setup-network.service.ts`: los comandos `nmcli con mod`, `nmcli con up`, `nmcli con add` y `systemctl restart dhcpcd` usaban `execa` directo sin sudo
- El usuario `homenas` tiene `NOPASSWD: ALL` en sudoers pero el wrapper `exec()` de `lib/exec.ts` es el que añade sudo automáticamente
- Todos los comandos migrados a `exec()` (elimina import `execa` del servicio)
- Bug detectado: `nmcli modify failed: Insufficient privileges` al intentar cambiar IP desde la UI

---

## 2026-04-16 — v3.7.6: I/O por disco en tiempo real + fix SMART Seagate (port PR#24-26 v2)

### Disk I/O en tiempo real (port PR#24)
- `GET /api/storage/disks/iostats?disks=sda,sdb` — lee `/sys/block/*/stat` con cálculo de delta entre llamadas
- Módulo-level Map de snapshots para calcular MB/s de lectura y escritura por disco
- `DisksCard.tsx` — dos nuevas columnas: `↑ Read` (verde) y `↓ Write` (amarillo), polling cada 3 s
- Sin dependencias externas: lectura directa del kernel, sin `iostat` ni herramientas adicionales
- Valores < 0.1 MB/s se muestran como `—`; entre 0.1 y 1 MB/s se muestran en KB/s

### Fix SMART Power-on hours Seagate (port PR#25/26)
- Seagate y algunos discos ponen datos extra en el raw de 48 bits del atributo 9, dando valores absurdos (ej: 1940582188501538 horas)
- Ahora parsea `raw.string` primero (ej: "51746h+07m+31.827s") y extrae los dígitos iniciales
- Fallback a `raw.value & 0xFFFFFFFF` para discos con codificación simple

---

## 2026-04-16 — v3.7.5: Audit log UI, DB backup y comprobación de integridad

### Audit log (SystemView)
- `AuditLogCard.tsx` — tabla paginada del registro de auditoría; muestra acción, usuario, detalle, IP y hora
- Paginación progresiva: botón "Cargar más" acumula páginas de 50 entradas
- Badges con color por tipo de acción (login, reboot, ssh_*, totp_*, create/delete_user…)
- Endpoint existente: `GET /api/system/audit-log?limit&offset` (admin only)

### DB backup y comprobación de integridad (SystemView)
- `DatabaseCard.tsx` — dos botones: "Descargar backup" y "Comprobar integridad"
- Backup: fetch autenticado → Blob → descarga directa con nombre `homenas-YYYY-MM-DDTHHMMSS.db`
- Integridad: `POST /api/system/db-integrity` → muestra resultado OK / error con detalle inline
- `systemApi.db.backup()` y `systemApi.db.integrity()` añadidos a `api/system.ts`

### Limpieza
- Eliminado HomeAI del README (nunca se implementó en v3; la v2 tiene la referencia)
- i18n: añadidas 15 claves a `system` en ES y EN

---

## 2026-04-16 — v3.7.4: Configuración IP en Network, toggle SSH en System

### Configuración IP (Network)
- `GET /api/network/ip-config` — devuelve interfaces con IP actual y modo (DHCP/estático)
- `POST /api/network/ip-config` — cambia una interfaz entre DHCP y estática; misma lógica que el wizard de setup (nmcli o dhcpcd según lo disponible)
- `IpConfigCard.tsx` — tabla de interfaces con botón "Configurar" por fila; inline form con toggle DHCP/Estática, campos IP/prefijo/gateway/DNS; alerta de advertencia antes de confirmar cambio (la IP puede cambiar)
- Invalidación retrasada 2 s para dar tiempo al cambio de red

### Toggle SSH (System)
- `GET /api/system/ssh` — estado actual del servicio (`systemctl is-active ssh/sshd`)
- `POST /api/system/ssh/enable` + `/disable` — activa/desactiva con `systemctl enable/disable --now`
- Detecta automáticamente nombre del servicio (`ssh` en Debian/RPi, `sshd` en otros)
- Entradas en audit_log: `ssh_enabled`, `ssh_disabled`
- `SshToggleCard.tsx` — badge estado, botón con confirmación de dos pasos (evita desactivación accidental)

---

## 2026-04-16 — v3.7.3: Alertas email + Telegram, refactor rutas TOTP a módulo propio

### Alertas externas
- `services/notifications.service.ts` — servicio central: guarda en tabla `notifications` + entrega por email y/o Telegram
- Email vía `nodemailer` (SMTP configurable, soporta SSL/TLS y STARTTLS, TLS autofirmado para servidores LAN)
- Telegram vía Bot API (`MarkdownV2` con escape automático de caracteres especiales)
- Contraseña SMTP y token Telegram cifrados con AES-256-GCM antes de guardar en DB
- `routes/notifications/index.ts` — rutas CRUD de configuración:
  - `GET /api/notifications/config` (admin) — devuelve config redactada (sin passwords/tokens)
  - `PUT /api/notifications/email` — actualiza configuración SMTP
  - `PUT /api/notifications/telegram` — actualiza bot token + chat ID
  - `PUT /api/notifications/settings` — toggle opciones (notif_on_login)
  - `POST /api/notifications/test` (rate limited) — envía notificación de prueba
- Hooks de alerta integrados:
  - `auth/index.ts`: cuenta bloqueada por brute force → `error`, inicio de sesión (opt-in) → `info`
  - `auth/totp.ts`: 2FA activado → `info`, 2FA desactivado → `warning`
- Frontend: `NotificationsConfigCard.tsx` en `SystemView` — formularios email y Telegram con toggle, guardar y envío de prueba

### Refactor TOTP → módulo propio
- Rutas TOTP movidas de `auth/index.ts` a `auth/totp.ts` (registrado como sub-plugin)
- `auth/index.ts` queda solo con login/logout/me

---

## 2026-04-16 — v3.7.2: 2FA/TOTP, idle session timeout, complejidad de contraseña

### 2FA / TOTP
- `otpauth` + `qrcode` instalados en backend
- Rutas: `GET /api/auth/totp/status`, `POST /api/auth/totp/setup` (genera secreto + QR PNG base64), `POST /api/auth/totp/enable` (verifica código, activa), `POST /api/auth/totp/disable` (verifica contraseña, desactiva)
- Login actualizado: si `totp_enabled=1`, requiere `totpCode` en body; sin código → 401 con `requireTotp: true`
- Frontend `LoginView`: flujo de dos pasos — step 1 credentials, step 2 TOTP (se activa automáticamente si el servidor pide código)
- Frontend `UsersView`: card "Two-Factor Authentication" — setup con QR, confirmación de código, desactivación con contraseña
- Audit log: eventos `totp_enabled`, `totp_disabled`

### Idle session timeout
- Migration v3: columna `idle_expires_at INTEGER DEFAULT 0` en tabla `sessions`
- Auth plugin: si `idle_expires_at > 0` y ha caducado → 401 "Session expired due to inactivity"
- Cada request autenticado actualiza `idle_expires_at` a `now + 8h`
- Sesiones antiguas (idle_expires_at=0) se inicializan en primer request sin interrupción

### Complejidad de contraseña
- Shared schema `strongPassword`: mín 8 chars + al menos una mayúscula + al menos un dígito
- Aplicado en `CreateUserSchema`, `UpdatePasswordSchema`, `AdminUpdatePasswordSchema`
- `SetupAccountSchema` y `SetupPasswordSchema` también actualizados con las mismas reglas

---

## 2026-04-16 — v3.7.1: Seguridad — HSTS, bloqueo de cuenta, autologin único, integridad DB al arranque, audit log, validación MIME

### HSTS
- `hsts: { maxAge: 31536000, includeSubDomains: true }` en helmet

### Bloqueo de cuenta (account lockout)
- Tabla `login_attempts(username, ip, success, created_at)`
- 5 intentos fallidos en 15 minutos → 429 con mensaje de bloqueo temporal
- Protección contra enumeración de usuarios: bcrypt corre siempre (hash dummy si usuario no existe)

### Autologin de setup — bloqueo permanente
- Flag `setup_ever_completed` se escribe en `/complete` y nunca se borra
- Aunque se resetee `setup_complete`, el autologin queda deshabilitado permanentemente
- Evita que se reutilice el autologin tras un reset malicioso del flag

### Integridad DB al arranque
- `PRAGMA integrity_check` justo después de correr migraciones
- Si no devuelve `ok`, se loguea error crítico (no bloquea arranque para no perder acceso)

### Audit log
- Tabla `audit_log(user_id, username, action, detail, ip, created_at)`
- Eventos registrados: `login`, `setup_complete`, `reboot`, `create_user`, `delete_user`, `change_password_self`, `admin_change_password`
- `GET /api/system/audit-log?limit&offset` (admin) — paginado, máx 500

### Validación MIME en uploads
- Lista negra de extensiones peligrosas: `.sh`, `.py`, `.js`, `.exe`, `.elf`, etc.
- Comprobación de magic bytes (primeros 4 bytes): ELF, MZ/PE, shebang (`#!`), Mach-O fat/32/64
- Archivos bloqueados se eliminan antes de mover al destino
- `Content-Disposition` sanitizado: elimina `\r\n"\\` del nombre de fichero

---

## 2026-04-16 — v3.7.0: Production readiness — migraciones, logging, paginación, backup DB, CSP, bodyLimit, contraseña aleatoria

### Versionado de migraciones DB
- `db.plugin.ts`: sistema `MIGRATIONS[]` + tabla `schema_migrations(version, applied_at)`
- Cada migración corre en transacción, se marca como aplicada, nunca se repite
- Schema actual = v1. Añadir v2+ al array para futuras ALTER TABLE

### Logging estructurado
- Producción: pino con transporte dual — stdout + fichero rotativo `logs/homenas.log`
- `pino-roll`: rotación a 10MB, conserva 3 ficheros
- Dev: solo stdout (sin fichero)

### Paginación en endpoints de lista
- `GET /api/active-backup/devices?limit=50&offset=0` → `{ items, total }`
- `GET /api/cloud-backup/remotes?limit=50&offset=0` → `{ items, total, limit, offset }`
- `GET /api/cloud-backup/jobs?limit=50&offset=0` → `{ items, total, limit, offset }`
- `GET /api/cloud-backup/transfers?limit=50&offset=0` → `{ items, total, limit, offset }`
- Límite máximo: 200 por petición

### Backup/restore DB
- `GET /api/system/db-backup` (admin): descarga hot backup via `db.backup()` — consistente sin parar el servidor
- `POST /api/system/db-integrity` (admin): `PRAGMA integrity_check` → `{ ok, details }`

### CSP header habilitado
- `helmet` con `contentSecurityPolicy` configurado: `default-src 'self'`, `style-src 'unsafe-inline'` (Tailwind), `img-src data: blob:`

### bodyLimit global
- 1MB en Fastify (multipart de ficheros tiene su propio límite)

### Contraseña inicial aleatoria
- `randomBytes(10).toString('base64url')` en lugar de `homenas1` hardcoded
- Visible una vez en los logs al primer arranque

---

## 2026-04-16 — v3.6.8: Security — cifrado AES-256-GCM de tokens en SQLite y Cloudflare fuera de ps

- `lib/crypto.ts`: `encryptSecret`/`decryptSecret` con AES-256-GCM, clave derivada de `/etc/machine-id`
  - Transparente: rows antiguas (sin prefijo `enc:`) se leen en plaintext sin romper nada
- `ddns.service.ts`: token cifrado al hacer INSERT, descifrado al leer (transparente para DNS updates)
- `cloud-backup.service.ts`: config JSON cifrada al guardar remoto, descifrada al leer
- `cloudflare.service.ts`:
  - Token cifrado en `settings` DB
  - Unit file ya no incluye `--token` en ExecStart — usa `EnvironmentFile=/etc/cloudflared/tunnel.env` (modo 0600)
  - Token eliminado del process listing (`ps aux`)

---

## 2026-04-16 — v3.6.7: Security — Content-Disposition header injection en descarga de ficheros

- `files/index.ts`: sanitizar nombre de fichero antes de escribirlo en `Content-Disposition` — elimina `\r`, `\n`, `"` y `\` que podrían usarse para inyectar headers HTTP

---

## 2026-04-16 — v3.6.6: Security — reboot adminOnly, DDNS tokens redactados, cloud-backup adminOnly

- `/api/system/reboot`: añadido `requireAdmin` — cualquier usuario autenticado podía reiniciar el NAS
- `/api/ddns/status`: tokens y username redactados en la respuesta pública (solo admin via `/configs` los ve)
- `/api/cloud-backup/remotes`: requiere ahora `requireAdmin` y elimina `configParsed` de la respuesta (contenía credenciales S3/GDrive/etc)
- Frontend: `configParsed` marcado como opcional en `CloudRemote` type

---

## 2026-04-16 — v3.6.5: Security — bloqueo login pre-setup y validación subred IP/gateway

- `authRoutes`: POST /api/auth/login devuelve 403 si `setup_complete !== '1'` — impide acceso con credenciales por defecto (admin/homenas1) saltándose el wizard
- `setup-network.service`: `validateGatewayInSubnet()` — comprueba que el gateway esté en la misma subred que la IP estática antes de aplicar la config (evita brickear el NAS)
- Cálculo de máscara con aritmética de bits sin dependencias externas

---

## 2026-04-16 — v3.6.4: Network security — validación de rutas Samba/NFS y límite WireGuard

- `createSambaShare` / `updateSambaShare`: rutas restringidas a prefijo `/mnt/` (path traversal bloqueado)
- `createNfsExport`: ídem, mismo whitelist `/mnt/`
- `addWireguardPeer`: límite de 100 peers (evita kernel panic en ARM con tablas de rutas masivas)
- `normalizePath` de `node:path` para canonicalizar antes de validar

---

## 2026-04-15 — v3.5.8: HomeAI — contexto dinámico del NAS en system prompt

- `buildNasContext()`: recopila en cada mensaje CPU/RAM, red, pool mergerfs, discos y contenedores
- Contexto inyectado al inicio del system prompt junto a las convenciones del NAS
- Convenciones documentadas al modelo: rutas absolutas, `/opt/stacks/`, `/mnt/storage/`, usuario homenas
- Coste: ~200-500ms extra antes de generar (Promise.allSettled de 5 servicios)

---

## 2026-04-15 — v3.5.7: HomeAI — fix chat 403 CSRF

- El POST `/api/homeai/chat` no enviaba `X-CSRF-Token`, que `requireAuth` exige en mutaciones
- Añadido header `X-CSRF-Token` desde `authStore.csrfToken` en el fetch del chat

---

## 2026-04-15 — v3.5.6: HomeAI — modelo qwen2.5:3b y system prompt base

- `DEFAULT_MODEL` cambiado de `gemma2:2b` a `qwen2.5:3b`
  - Motivo: soporta tool calling (necesario para acciones futuras), mejor razonamiento técnico y YAML/Docker
  - Recomendación actual: `qwen2.5:3b` hasta encontrar modelo más rápido con igual calidad
  - El modelo ocupa 1.9 GB en `/mnt/sdb/homenasos_ai`
- System prompt fijo: limita al asistente al ámbito NAS, rechaza preguntas fuera de dominio
- Fix directorio modelos Ollama: `/mnt/sdb/homenasos_ai` no existía → creado con `chown ollama:ollama`

---

## 2026-04-15 — v3.5.5: Eliminar Cloudflare Tunnel de UI

- Eliminado `CloudflareCard` de NetworkView
- Eliminado paso "Acceso externo" del SetupWizard (wizard pasa de 6 pasos a 5)
- Motivo: Zero Trust exige tarjeta incluso en plan gratuito, barrera inaceptable para usuarios no técnicos
- El DDNS con Cloudflare API (sin tunnel) no se ve afectado

---

## 2026-04-15 — v3.5.4: Fix dirección gráfica Bandwidth

- `drawLine()` hacía `.reverse()` sobre los datos → punto más reciente aparecía a la izquierda
- Eliminado `.reverse()`: el tiempo fluye izquierda→derecha (oldest→newest)

---

## 2026-04-15 — v3.5.3: Dashboard — quitar agrupación por rol en DisksSection

- `Disk` no tiene campo `role` (solo `MergerFSDrive`), todos aparecían como "Sin asignar"
- Grid plano sin agrupación; eliminadas constantes `DISK_ROLE_LABELS` y `DISK_ROLE_COLORS`

---

## 2026-04-15 — v3.5.2: Fix crash Dashboard — ddnsData.filter is not a function

- `DdnsStatus` es un objeto `{enabled, provider, ...}`, no un array
- Cast incorrecto a `[]` pasaba TypeScript pero reventaba en runtime
- Fix: `ddnsData?.enabled ? 1 : 0`

---

## 2026-04-15 — v3.5.1: HomeStore — botones de acción reemplazados por iconos

- Acciones (Detener/Reiniciar/Logs/Actualizar/Eliminar) → iconos w-8 h-8 con title tooltip
- Instalar conserva texto+icono (Download) ya que es la acción principal
- Iniciar → Play (verde), Detener → Square (ámbar), Reiniciar → RotateCcw, Logs → ScrollText, Actualizar → RefreshCw, Eliminar → Trash2
- Elimina el descuadre de botones de texto de longitud variable

---

## 2026-04-15 — v3.5.0: Port completo dashboard v2 → v3

### Backend
- `getCpuInfo()`: modelo CPU desde /proc/cpuinfo con ARM part map, cores físicos, velocidad GHz
- `getCoreLoads()`: carga por núcleo individual desde /proc/stat con delta tracking (prevCoreSnapshots)
- `getSwap()`: swap total/usado desde /proc/meminfo
- `SystemMetrics` schema: cpu.{model, physicalCores, speedGhz, coreLoads}, memory.{swapTotalBytes, swapUsedBytes}
- `GET /api/network/public-ip`: llama ipify.org con caché de 5 min
- `networkApi.getPublicIp()` + `usePublicIp()` hook (5 min refetch)

### Frontend — tarjetas actualizadas
- **CPU**: modelo y GHz en header, "X núcleos · Y hilos", mini barras por núcleo con color escalonado
- **Memoria**: fila Swap si existe
- **Red**: IP local (primer iface activa), IP pública, DDNS activos, además de gráficas RX/TX

### Frontend — secciones nuevas
- **DisksSection**: panel de discos agrupados por rol (datos/paridad/caché/sin asignar), temperatura SMART, barra de uso, estado healthy
- **CacheWidget**: disco(s) caché MergerFS con uso y barra
- **DockerWidget**: todos los contenedores con estado, imagen y CPU%; visible si hay contenedores

---

## 2026-04-15 — v3.4.9: Gráficas sparkline en tarjetas CPU/Memoria/Red

### Cambios
- `Sparkline` — componente SVG puro (sin dependencias): línea + relleno, eje Y normalizado al máximo histórico
- `useHistory<T>` — acumula los últimos 40 puntos (~80s) en un `useRef`
- CPU: sparkline índigo/ámbar según carga, sustituye la barra de progreso
- Memoria: igual, sparkline índigo/ámbar
- Red: dos sparklines separadas (RX verde ↓, TX azul ↑), cada una con su label+valor en la misma fila — sentido correcto del eje Y

---

## 2026-04-15 — v3.4.8: Dashboard grid 3 columnas

- Grid cambiado a `lg:grid-cols-3`, eliminado max-w-5xl para usar ancho completo

---

## 2026-04-15 — v3.4.7: Rediseño visual tarjetas Dashboard

### Cambios
- Cards compactas estilo HomeStore: `rounded-xl p-5`, sin labels en MAYÚSCULAS
- Componentes nuevos: `CardTitle` (icon+título+derecha), `Row` (label izq, valor der), `BigValue`, `Divider`, `ProgressBar` más fina (h-1)
- CPU: % en grande + barra + filas temperatura/load avg; color ámbar si >80%
- Memoria: igual que CPU, total en header, color ámbar si >85%
- Red: 2 mini-cards RX/TX con iconos ArrowDown/ArrowUp + filas totales
- Uptime: valor grande + hostname en fila
- Fans/Temp: filas con icono Fan/Thermometer; temperatura con color escalonado (verde/ámbar/rojo por umbral)
- Potencia: 3 mini-cards Vatios/Voltios/Amperios (W en índigo, V/A en neutro)

---

## 2026-04-15 — v3.4.6: Ventilador EMC2301 visible en tarjeta Fans/Temp

### Problema
El ventilador EMC2301 (I2C bus 10, addr 0x2e) no aparecía porque el driver `emc2305` no se enlazaba automáticamente al dispositivo `microchip,emc2301` del device tree.

### Solución
- Regla udev `/etc/udev/rules.d/99-emc2301-fan.rules` que hace el bind de `10-002e` al driver `emc2305` en cada arranque
- `getFanMetrics()`: lee `name` del chip y lo incluye en el nombre del ventilador ("emc2305 Fan 1")
- Filtrado de rpm === 0 para no mostrar ventiladores desconectados (Fan 2 del EMC2301 no está conectado)
- Resultado: Fan 1 (~1040 RPM, ~30% PWM) visible en la UI

---

## 2026-04-15 — v3.4.5: Temperaturas hwmon en tarjeta Ventiladores/Temperatura

### Problema
La tarjeta "Ventiladores / Temperatura" no mostraba ninguna información en RPi5. El backend no leía los sensores de temperatura hwmon (`temp*_input`) y nunca populaba el campo `temps`.

### Solución
- Nueva función `getTempMetrics()` en `system.service.ts` que itera sobre `/sys/class/hwmon/hwmon*/temp*_input`
- Lee `name` del chip y `temp*_label` opcionales para nombres legibles (CPU, RP1, PSU…)
- `CHIP_LABELS` map para traducir nombres de chip a etiquetas humanas (cpu_thermal→CPU, rp1_adc→RP1, ina238→PSU)
- Añadida al `Promise.all` de `getSystemMetrics()` e incluida en el return como `temps`
- En RPi5 muestra: CPU (30.9°C), RP1 (40.4°C), PSU (26.5°C)

---

## 2026-04-15 — v3.4.4: Filtro interfaces virtuales Docker en Network

### Cambios
- **Network Interfaces card** — filtradas interfaces virtuales: `docker0`, `veth*`, `br-*`, `virbr*`, `tun*`, `tap*`, `lo`; solo se muestran interfaces físicas (eth*, wlan*, etc.)
- **Bandwidth chart** — mismo filtro aplicado en `getNetworkBandwidthStats()` para que el gráfico tampoco muestre tráfico de interfaces virtuales

---

## 2026-04-15 — v3.4.3: Port de PRs de v2 (iconos Docker, badge conexiones, filtro env vars)

### Portado desde v2 (PR#19, PR#20, PR#env, PR#icons)
- **Docker container icons** — mapa de 55+ aliases (walkxcode dashboard-icons CDN) en `ContainersCard.tsx`; fallback a 🐳 si no existe icono; lógica de normalización de nombre igual que v2
- **Samba badge conexiones activas** — `ConnectedBadge` en header de SambaCard, verde si hay sesiones activas, gris si no (mismo patrón que NfsCard que ya lo tenía)
- **Docker env vars — filtro sistema** — `ENV_SKIP` regex en `docker.service.ts` elimina PATH, HOME, SHELL, TZ, S6_*, XDG_*, LSIO_*, LC_*, LANG etc.; solo se muestran vars de aplicación relevantes

### No portado (ya implementado en v3)
- PR `50a0e51` NFS fsid para MergerFS — ya estaba en v3 desde el inicio

---

## 2026-04-15 — v3.4.2: Traducciones completas en todas las vistas

### Vistas ahora completamente traducidas
- **HomeStoreView** — página, modales (Logs, Desinstalar, Instalar), toasts, etiquetas de puertos/volúmenes/env
- **DockerView / NetworkView** — títulos y subtítulos de página
- **BackupView** — título, subtítulo, botón "Nuevo trabajo"
- **UsersView** — badges 2FA On/Off
- **CreateUserModal** — título, campos, permisos de carpetas, validaciones, botones
- **ChangePasswordModal** — título dinámico, campos, botones
- **FilesView** — breadcrumb "Inicio", zona de subida, barra de selección, tooltips

### translations.ts ampliado con ~80 strings nuevos
- `homestore.*` (subtitle, loading, errors, modales, toasts)
- `users.*` (2FA, permisos, validaciones, contraseña)
- `backup.subtitle`, `backup.newJob`
- `files.*` (home, dropHere, uploadingProgress, selected fn, move, tooltips)
- `network.subtitle`

---

## 2026-04-15 — v3.4.1: Fixes visibilidad texto, dirección bandwidth, traducciones completas

### Bugs corregidos
- **FilesView** — nombres de archivo invisibles en modo claro: `text-white` → `text-gray-900 dark:text-white` / `text-gray-700 dark:text-white/80`
- **BandwidthChart** — gráfica iba en dirección contraria (nuevo a la derecha); ahora el dato más reciente aparece a la izquierda: `[...data].reverse().map(...)`
- **HomeStoreView** — badges de estado y botones de acción seguían en inglés; refactorizado `STATUS_BADGE` → `STATUS_BADGE_CLASSES` + componente `StatusBadge` con `useT()`
- **ActiveDirectoryView** — mostraba JSON crudo en errores de API; añadida función `parseApiError()` que extrae primera línea limpia

### Traducciones añadidas
- `CloudBackupView` — namespace `t.cloudBackup.*`
- `ActiveBackupView` — namespace `t.activeBackup.*`
- `ActiveDirectoryView` — namespace `t.activeDirectory.*`
- `translations.ts` ampliado con ~60 strings nuevos en ES+EN

---

## 2026-04-13 — Fase 1: Scaffolding inicial

### Estructura monorepo
- Creado monorepo pnpm workspaces con estructura: `apps/frontend`, `apps/backend`, `packages/shared`
- TypeScript project references para builds incrementales
- TailwindCSS v4, shadcn/ui, React 19, Fastify v5

### Stack elegido (según spec)
- **Frontend**: React 19 + TypeScript + Vite + TailwindCSS v4 + shadcn/ui + Zustand + React Router v7 + TanStack Query v5
- **Backend**: Fastify v5 + TypeScript + better-sqlite3 + Zod
- **Shared**: Tipos y schemas Zod compartidos
- **Auth**: Sesiones por header X-Session-Id + CSRF token, RBAC admin/user

### Decisiones
- pnpm workspaces como gestor de monorepo (rendimiento, deduplicación)
- TypeScript strict mode en todos los paquetes
- Zod como single source of truth para validación (compartido via packages/shared)
- better-sqlite3 síncrono — suficiente para NAS casero, evita complejidad async de ORM
- execa para todos los procesos del sistema — nunca shell injection

---

## 2026-04-13 — Fase 2: Backend core

### Implementado
- `plugins/db.plugin.ts` — SQLite con better-sqlite3, migraciones inline (users, sessions, settings, scheduled_tasks, backup_jobs, backup_runs, notifications), seed admin
- `plugins/auth.plugin.ts` — `requireAuth` decorator: valida `X-Session-Id`, popula `request.user`
- `plugins/rbac.plugin.ts` — `requireAdmin` decorator: comprueba `request.user.role`
- `repositories/users.repo.ts`, `sessions.repo.ts`, `scheduler.repo.ts`, `backup.repo.ts`
- `routes/auth/` — login, logout, me
- `lib/exec.ts` — wrapper seguro sobre execa (nunca shell)

### Bug encontrado y resuelto
- **Contraseña por defecto**: `LoginSchema` tiene `min(8)`, pero "homenas" tiene 7 caracteres. Contraseña del admin seed cambiada a `homenas1`.
  - **Acción requerida**: Al hacer deploy en el NAS, cambiar la contraseña desde la UI de Users o via SQL.

### Decisiones
- Validación: todas las rutas usan `zod.safeParse()` manualmente. **No** se pasa el schema Zod a Fastify directamente (Fastify v5 usa JSON Schema nativo, no Zod).
- bcryptjs con 10 rounds para hashes de contraseña

---

## 2026-04-13 — Fase 3: Frontend core

### Implementado
- `stores/authStore.ts` — Zustand persist en sessionStorage
- `stores/uiStore.ts` — sidebar collapsed + theme, persist en localStorage
- `api/client.ts` — `apiFetch<T>` (auto-logout en 401) + `silentFetch` (sin auto-logout, para polling de background)
- `components/layout/Sidebar.tsx` — sidebar colapsable, 9 módulos con Lucide icons
- `components/layout/AppLayout.tsx` — layout fijo con Outlet
- `views/auth/LoginView.tsx` — glassmorphism, React Hook Form + Zod
- `router.tsx` — rutas protegidas con `RequireAuth` guard
- `lib/utils.ts` — `cn()`, `formatBytes()`, `formatUptime()`

---

## 2026-04-13 — Fase 4: Módulos funcionales

### Dashboard
- Backend: `services/system.service.ts` — CPU (diff /proc/stat), RAM (os module), red (/proc/net/dev), temp, fans (hwmon/emc), potencia (hwmon/ina). Todo con fallback graceful para dev.
- Frontend: polling cada 2s, 6 cards (CPU, RAM, Red, Uptime, Fans, Potencia)

### Storage
- Backend: `services/storage.service.ts` — lsblk JSON, SMART via smartctl, MergerFS mount detection, SnapRAID + Badblocks como procesos background con módulo-level state
- Frontend: DisksCard, SnapRaidCard (polling adaptativo), MergerFSCard, BadblocksCard
- Patrón largo: POST /start → background → GET /progress con polling (refetchInterval condicional)

### Docker
- Backend: `docker ps --format '{{json .}}'` parsing, docker stats por contenedor running, compose background actions
- Frontend: ContainersCard con badges de estado, LogsModal auto-scroll, ComposeStacksCard con live output

### Network
- Backend: `ip -j addr` + `ip -j -s link` para interfaces, WireGuard via `wg show dump`, smb.conf parser, /etc/exports parser
- Frontend: InterfacesCard, WireguardCard + AddPeerModal (muestra .conf + QR code), SambaCard, NfsCard

### Users
- RBAC admin/user, bcrypt passwords, guard last-admin (no se puede borrar el último admin)
- Frontend: tabla con badges de rol, modales de crear/cambiar contraseña

### Scheduler
- node-cron para scheduling, execFile (sin shell), persiste en SQLite
- **Bug resuelto**: import de node-cron — `import nodeCron from 'node-cron'` no funciona en ESM. Solución: `import * as nodeCron from 'node-cron'`
- Frontend: cards con toggle enable/disable, Run Now, cron expression preview

### System
- Backend: lsb_release/os-release con fallback, upsc para UPS, notifications en SQLite
- Frontend: SystemInfoCard, UpsCard (gauge SVG circular), NotificationsCard, OtaCard (placeholder)

### HomeAI
- Backend: Ollama status via HTTP local, chat SSE streaming, install/uninstall como background process
- **Modelo**: siempre leído del API de Ollama (`/api/tags`), nunca hardcodeado en frontend
- Frontend: InstallCard con live log, ChatView con SSE streaming + autoscroll
- **Bug resuelto**: `schema: { body: ZodSchema }` en Fastify v5 no funciona (espera JSON Schema nativo). Solución: quitar el `schema:` de Fastify y hacer `ZodSchema.safeParse(request.body)` manualmente en cada ruta.

### Backup
- Backend: rsync/tar/rclone como procesos background, parse de progreso rsync (%), historial en SQLite
- Frontend: BackupJobsCard, BackupProgressCard (live output), BackupHistoryModal

---

## 2026-04-13 — Resultado final

### Estado
- ✅ TypeScript: 0 errores (backend + frontend)
- ✅ Backend arranca limpio en puerto 3000
- ✅ Health check: `GET /api/health` → `{ status: 'ok', version: '3.0.0' }`
- ✅ Login funciona: `POST /api/auth/login` → `{ sessionId, csrfToken, user }`
- ⏳ Frontend: no probado en browser (Vite dev server no iniciado en esta sesión)

### Credenciales por defecto
- Usuario: `admin`
- Contraseña: `homenas1`
- ⚠️ Cambiar en producción

### Para arrancar en desarrollo
```bash
# Terminal 1 — backend (puerto 3000)
pnpm --filter @homenas/backend dev

# Terminal 2 — frontend (puerto 5173, proxy /api → 3000)
pnpm --filter @homenas/frontend dev
```

---

## 2026-04-13 — Fase 5: Cloudflare Tunnel + Setup Wizard

### Implementado
- `packages/shared/src/schemas/cloudflare.schema.ts` — CloudflareStatusSchema, CloudflareConfigSchema
- `apps/backend/src/lib/settings.ts` — helpers getSetting/setSetting/deleteSetting sobre tabla settings
- `apps/backend/src/services/cloudflare.service.ts` — install, configure, start, stop, remove. Detecta platform (darwin vs linux-arm64) para descargar binario correcto.
- `apps/backend/src/routes/network/cloudflare.ts` — GET /status, POST /configure (instala si no está), /start, /stop, /remove
- `apps/backend/src/routes/setup/index.ts` — GET /api/setup/status (sin auth), POST /api/setup/complete
- `apps/frontend/src/views/setup/SetupWizard.tsx` — wizard 3 pasos: Bienvenido → Cloudflare (opcional) → Listo
- `apps/frontend/src/views/network/CloudflareCard.tsx` — 4 estados: no configurado, instalando, activo, detenido
- `apps/frontend/src/components/SetupGuard.tsx` — redirige a /setup si setup_complete=false

### Decisión de arquitectura
- Si Cloudflare Tunnel no es viable para el público, se puede eliminar borrando: `cloudflare.service.ts`, `cloudflare.ts` (routes), `CloudflareCard.tsx`, `CloudflareConfigModal.tsx`, `SetupWizard.tsx` y `SetupGuard.tsx`. El resto de la app no se ve afectado.
- Fallback siempre disponible: certificado autofirmado + acceso por IP en red local (solución v2)

### Verificado (endpoints reales)
- `GET /api/setup/status` → `{ complete: false }` (sin auth, correcto)
- `GET /api/network/cloudflare/status` → `{ configured: false, installed: false, running: false, ... }` (con auth)
- TS 0 errores backend + frontend

---

## Para deploy en el NAS (Raspberry Pi CM5)
```bash
pnpm build  # tsc + vite build
node apps/backend/dist/server.js  # sirve API + estáticos en puerto 3000
```

---

## 2026-04-13 — Fase 7: Auditoría de seguridad y correcciones

### Auditoría
Auditoría completa realizada con 4 agentes paralelos (2×Opus, 2×Sonnet) cubriendo:
- Auth plugin, gestión de sesiones, CSRF, DB plugin
- Servicios backend (inyección de comandos, path traversal, parsing inseguro)
- Todas las rutas backend (cobertura de auth, validación de input, rate limiting)
- Frontend (XSS, CSRF, datos sensibles, gestión de auth)

### Correcciones aplicadas

#### CRÍTICAS
- **CSRF validation** (`auth.plugin.ts`): `requireAuth` ahora valida `X-CSRF-Token` contra el token de sesión en todos los métodos mutantes (POST/PUT/PATCH/DELETE). Los métodos seguros (GET/HEAD/OPTIONS) están exentos.
- **Shell injection** (`network.service.ts`): Eliminado `bash -c "echo '...' | wg pubkey"`. Ahora usa `execa('wg', ['pubkey'], { input: clientPrivKey })` — stdin directo, sin shell.
- **RCE via extraArgs** (`backup.service.ts`): Añadida función `validateExtraArgs()` que bloquea flags peligrosos antes de construir el comando: `-e`, `--rsh`, `--rsync-path` (rsync) y `--use-compress-program`, `-I`, `--to-command` (tar).
- **Token injection → systemd** (`cloudflare.service.ts`): Añadida función `validateToken()` con regex estricto `[A-Za-z0-9._\-]{50,2048}` — bloquea newlines, comillas y caracteres de control antes de escribir el unit file.

#### ALTAS
- **@fastify/helmet** (`app.ts`): Registrado globalmente — añade `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Referrer-Policy`, etc.
- **@fastify/rate-limit** (`app.ts` + `auth/index.ts`): Límite global 200 req/min. Login con límite estricto: 10 intentos / 15 minutos por IP.
- **Timing attack** (`auth/index.ts`): Siempre se ejecuta `bcrypt.compare()` aunque el usuario no exista (comparación contra `DUMMY_HASH`) — elimina enumeración de usuarios por tiempo de respuesta.
- **Bcrypt async** (`auth/index.ts`, `users.service.ts`): Cambiado de `compareSync`/`hashSync` a `compare`/`hash` (async) — libera el event loop durante operaciones CPU-intensivas.
- **Coste bcrypt 12** (`users.service.ts`): Aumentado de 10 a 12 rondas (~4× más trabajo para un atacante con rainbow tables).
- **Invalidación de sesiones al cambiar contraseña** (`users.service.ts`): `updatePassword()` y `adminUpdatePassword()` ahora llaman a `sessionsRepo.deleteByUserId()` — las sesiones antiguas quedan inválidas.
- **CSRF token en apiFetch** (`api/client.ts`): Todas las peticiones mutantes envían `X-CSRF-Token` desde `authStore`.

#### MEDIAS
- **Sliding expiry** (`auth.plugin.ts`): `requireAuth` renueva el TTL de la sesión en cada request autenticado.
- **Limpieza de sesiones expiradas** (`db.plugin.ts`): `DELETE FROM sessions WHERE expires_at < unixepoch()` al arrancar el servidor.
- **`updateExpiry()`** (`sessions.repo.ts`): Nuevo método en el repositorio para actualizar la expiración de una sesión.

#### BAJAS
- **Health endpoint** (`app.ts`): Eliminado `version: '3.0.0'` del response — no hay información de versión expuesta.

### Verificado
- `pnpm --filter @homenas/backend typecheck` → 0 errores
- `pnpm --filter @homenas/frontend typecheck` → 0 errores

---

## 2026-04-14 — Fase 7 (cont.): Correcciones de seguridad pendientes

### Correcciones aplicadas

#### CRÍTICAS
- **Ollama TOCTOU** (`ollama.service.ts`): El script de instalación ya no se descarga a `/tmp/ollama-install.sh` (nombre predecible, vulnerable a symlink attack). Ahora usa un nombre aleatorio: `/tmp/ollama-install-<8 bytes hex>.sh` via `randomBytes`.

#### ALTAS
- **Compose path traversal** (`docker.schema.ts` + `docker.service.ts`): `ComposeActionSchema.path` ahora exige que la ruta empiece por `/opt/stacks` y no contenga `..`. La misma validación defensiva se aplica dentro de `composeAction()`.
- **Docker containerId doble validación** (`docker.service.ts`): `containerAction()` y `getContainerLogs()` validan el ID con `/^[a-zA-Z0-9_-]{1,64}$/` a nivel de servicio (además del schema).
- **execa maxBuffer** (`exec.ts`): Añadido `maxBuffer: 4 * 1024 * 1024` (4 MB) en todas las llamadas via la función `exec()` — evita OOM por procesos desbocados.
- **SIGTERM/SIGINT graceful shutdown** (`server.ts`): El servidor ahora intercepta `SIGTERM` y `SIGINT`, para los cron jobs del scheduler y cierra el servidor limpiamente antes de salir.

#### MEDIAS
- **Backup source/destination** (`backup.schema.ts`): Rutas limitadas a 1024 chars, se rechaza `..`. `extraArgs` limitado a 256 chars por argumento, se rechaza null byte.
- **Scheduler command** (`scheduler.schema.ts`): `command` solo acepta caracteres seguros (`[a-zA-Z0-9/_.\\-]`) y rechaza `..` — sin path traversal ni caracteres shell.
- **WireGuard allowedIPs** (`network.schema.ts`): Validación CIDR estricta (IPv4 `x.x.x.x/n` e IPv6 `::x/n`), acepta listas separadas por comas.

#### BAJAS
- **Normalización de errores 500** (`app.ts`): `setErrorHandler` global — los errores 5xx devuelven siempre `"An unexpected error occurred"` sin filtrar mensajes internos al cliente. Los 4xx (intencionados) pasan su mensaje normalmente.

### Verificado
- `pnpm -r typecheck` → 0 errores en backend, frontend y shared

---

## 2026-04-14 — Fase 8: Setup Wizard — mejoras de UX y fiabilidad

### Cambios aplicados

#### Wizard — step indicators alineados
- Reescrito `StepIndicators` con estructura flat: cada item es `flex items-start flex-1` con columna fija de 52px para el círculo + label.
- El conector entre items es `flex-1 h-0.5 mt-4 mx-1` (fuera del item div), garantizando que todos los conectores queden centrados con los círculos independientemente del texto del label.
- Causa original: el label "Acceso externo" (2 líneas) empujaba los elementos hacia abajo cuando el conector vivía dentro del mismo contenedor que el label.

#### Wizard — placeholder username corregido
- `StepAccount`: placeholder del campo usuario cambiado de `"tuusuario"` (todo junto) a `"usuario"`.
- Archivo: `apps/frontend/src/views/setup/SetupWizard.tsx`

#### Storage — sda y sdb siempre NVMe
- En `resolveDiskType()` añadida regla explícita: si el nombre del dispositivo es `sda` o `sdb` → tipo `nvme`, sin importar lo que reporte `lsblk`.
- Motivo: en la CM5 los slots M.2 se conectan por bridge USB 3.0, por lo que `lsblk` informa `tran=usb` aunque los discos sean NVMe.
- Archivo: `apps/backend/src/services/storage.service.ts`

#### Storage — formateo de discos en uso
- Añadida función `prepDisk(device)` que se ejecuta antes de cada `parted mklabel gpt`:
  1. Lee `/proc/mounts` y desmonta todas las particiones del disco con `umount -l` (lazy, nunca falla).
  2. Desactiva grupos LVM (`vgchange -an`).
  3. Limpia todas las firmas con `wipefs -a -f`.
  4. Pone a cero los primeros 10 MB con `dd` (borra MBR/GPT residuales).
  5. `partprobe` + 1 segundo de espera para que el kernel actualize su vista.
- Permite formatear discos que ya tenían datos o estaban montados desde una configuración anterior, situación habitual al relanzar el wizard.
- Error anterior: `Failed to create GPT on /dev/sdb: Error: Partition(s) on /dev/sdb are being used.`
- Archivo: `apps/backend/src/services/setup-pool.service.ts`

### Verificado
- `pnpm -r typecheck` → 0 errores en backend, frontend y shared

### Para aplicar en el NAS
```bash
git pull && pnpm build && systemctl restart homenas.service
```

---

## 2026-04-14 — Fase 9: Módulos nuevos + bugs + fixes de v2

### Bugs corregidos

#### Backend
- **Fans no detectados**: `getFanMetrics()` filtraba por nombre de chip (`includes('emc')`), excluyendo todos los demás hwmon. Ahora itera todos los `/sys/class/hwmon/hwmon*` sin filtro de nombre.
- **sdb modelo "456"**: si `sda` o `sdb` tienen un modelo de 1-3 dígitos (número corto del bridge USB), se reemplaza por `"NVMe SSD"`.
- **MergerFS muestra 925GB**: `getMergerFSStatus()` hacía `df` sobre el mount point del pool, incluyendo discos de paridad. Ahora suma individualmente los discos de datos (`/mnt/disks/disk*`) excluyendo paridad.
- **Badblocks 0% progreso**: `text.split('\n')` no capturaba actualizaciones `\r` (carriage return). Cambiado a `split(/[\r\n]+/)` y regex ajustado a `/(\d+(?:\.\d+)?)\s*%\s*done/`.
- **Stop badblocks crash**: `kill('SIGTERM')` lanzaba excepción si el proceso ya había terminado. Envuelto en `try/catch`.
- **SnapRAID botones**: ya estaban correctamente implementados (no era un bug de backend).

#### Frontend
- **FansCard**: schema ajustado con `.optional()` en campos, añadida sección de temperaturas.
- **Stop badblocks sin feedback**: botón ahora muestra "Deteniendo...", invalida query en `onSuccess`, muestra error si falla.
- **Unidades comerciales**: `formatBytes()` usa divisor 1000 (TB/GB comercial) en vez de 1024.
- **Permisos de usuario**: modal de crear/editar usuario muestra sección de permisos por carpeta cuando `role === 'user'`: botones rápidos para rutas canónicas, toggle ro/rw por carpeta, input manual.

### Módulos nuevos

#### Docker App Store (HomeStore)
- Catálogo de 18+ apps populares de NAS (Plex, Jellyfin, Nextcloud, Home Assistant, Portainer, Pi-hole, etc.)
- Install con 1 clic: puertos, volúmenes y env vars configurables en modal
- Start/stop/restart/update/uninstall por app
- Logs en tiempo real
- Configuración persistida en `/opt/homenas-v3/homestore/<id>.json`
- Archivos: `homestore.service.ts`, `routes/homestore/`, `HomeStoreView.tsx`

#### Active Directory (Samba AD DC)
- Provisioning de dominio Samba AD DC
- CRUD de usuarios: crear, borrar, habilitar/deshabilitar, reset de contraseña
- CRUD de grupos y membresía
- Lista de equipos del dominio
- Instalación con live output, control de servicio start/stop/restart
- Archivos: `active-directory.service.ts`, `routes/active-directory/`, `ActiveDirectoryView.tsx`

#### Active Backup (backup distribuido con agentes)
- Modelo pull-based: agentes registran dispositivos, admin aprueba, agentes hacen polling
- File-level backup via rsync SSH con deduplicación por hardlinks
- Versioning: `/mnt/storage/active-backup/<id>/v1/`, `v2/`... + symlink `latest`
- Retención automática configurable
- File browser por versión, historial de runs
- Tablas DB: `ab_devices`, `ab_backup_runs`
- Archivos: `active-backup.service.ts`, `active-backup.repo.ts`, `routes/active-backup/`, `ActiveBackupView.tsx`

#### Syncthing
- Integración completa via API REST de Syncthing (localhost:8384)
- Install, start/stop, CRUD de dispositivos y carpetas compartidas
- Estado de sincronización por carpeta
- Archivos: `syncthing.service.ts`, `routes/syncthing/`, `SyncthingView.tsx`

#### Cloud Backup (rclone)
- Soporte para 9+ proveedores: Google Drive, Dropbox, OneDrive, S3, B2, MEGA, SFTP, FTP, WebDAV
- CRUD de remotes, jobs de sync/copy/move, historial de transferencias
- Transferencias en background con cancelación
- Tablas DB: `cloud_backup_remotes`, `cloud_backup_jobs`, `cloud_backup_transfers`
- Archivos: `cloud-backup.service.ts`, `routes/cloud-backup/`, `CloudBackupView.tsx`

#### File Manager
- Operaciones completas: listar, crear directorio, borrar, renombrar, mover, copiar, descargar, subir (multipart)
- Búsqueda recursiva (máx 100 resultados, maxdepth 5)
- Validación path traversal: sin `..`, dentro de `/mnt/`
- UI: árbol lateral, breadcrumb, grid/lista, drag & drop upload, menú contextual, selección múltiple
- Archivos: `files.service.ts`, `routes/files/`, `FilesView.tsx`

#### DDNS
- Proveedores: DuckDNS, No-IP, Cloudflare, Dynu
- Actualización automática cada 5 minutos en background
- Tabla DB: `ddns_config`
- UI: card dentro de NetworkView
- Archivos: `ddns.service.ts`, `routes/ddns/`, `DDNSCard.tsx`

#### System Updates
- Actualizaciones de app: `git fetch` + commits pendientes
- Actualizaciones de OS: `apt-get --simulate upgrade`
- Live output del proceso de actualización
- Rate limit: 1 actualización/hora
- UI: UpdatesCard dentro de SystemView (reemplaza OtaCard placeholder)
- Archivos: `updates.service.ts`, `routes/updates/`, `UpdatesCard.tsx`

### Módulos completados (parciales de v2)

#### WireGuard — completado
- Instalación automática (`apt-get install wireguard wireguard-tools qrencode`)
- Init del servidor con generación de keypair
- QR codes como PNG base64 via `qrencode -t PNG -o -`
- Asignación automática de IPs libres en 10.0.0.x/32
- Peer configs en sidecars `/etc/wireguard/peers/<pubkey>.conf`
- UI: estado instalado/configurado/activo, modal QR, controles start/stop/restart

#### Samba — CRUD completo
- `createSambaShare`, `updateSambaShare`, `deleteSambaShare`, `listConnectedUsers`
- UI: tabla con edición inline, modal de creación, tab de sesiones activas con auto-refresh 15s
- Badge verde/rojo según conexiones activas

#### NFS — completado + fixes de v2
- CRUD: `createNfsExport`, `updateNfsExport`, `deleteNfsExport`
- Fix path duplicado: rutas absolutas usadas directamente sin concatenar
- `fsid=N` automático (hash djb2 del path, obligatorio para MergerFS/FUSE)
- `exportfs -ra` vía execa
- Clientes conectados via `ss -tnp | grep ':2049'`
- Badge verde/rojo + lista de IPs conectadas

### Fixes portados del v2 (PRs #14-#21)

- **PR #16 — Docker env vars**: `docker inspect` por contenedor, sección colapsable en tarjeta, valores sensibles (`PASSWORD/SECRET/TOKEN/KEY`) enmascarados como `***`
- **PR #17 — HomeStore icon aliases**: alias de iconos para todas las apps del catálogo
- **PR #18 — NFS path/fsid/exportfs**: cubierto en "NFS completado" arriba
- **PR #21 — Samba/NFS badges + clientes**: badge verde/rojo + listas de clientes en ambas cards
- **PR #15 — Bandwidth chart**: `BandwidthChart` con canvas (sin librerías), historial 60 puntos, RX verde / TX indigo, polling 1.5s, selector de interfaz
- **PR #14 — File disk column**: columna de disco en FilesView (qué disco físico en MergerFS)
- **PR #11 — Docker widget mejorado**: iconos de contenedores en dashboard, menú contextual

### Infraestructura compartida
- `app.ts`: 8 nuevas rutas registradas (homestore, ad, active-backup, syncthing, cloud-backup, files, ddns, updates) + hook `onReady` para DDNS updater
- `router.tsx`: 6 nuevas rutas lazy (homestore, active-directory, active-backup, syncthing, cloud-backup, files)
- `Sidebar.tsx`: 6 nuevos items de navegación con iconos Lucide
- `db.plugin.ts`: 6 nuevas tablas (ab_devices, ab_backup_runs, cloud_backup_remotes, cloud_backup_jobs, cloud_backup_transfers, ddns_config)

### Verificado
- `pnpm -r typecheck` → 0 errores en backend, frontend y shared

---

## 2026-04-14 — Fase 8 (cont.): Fixes de formateo y redirección post-wizard

### Autologin busca por rol en vez de username
- `POST /api/setup/autologin` buscaba `username = 'admin'` hardcodeado. Si el wizard ya había renombrado al usuario (p.ej. a `juanlu`), el endpoint fallaba con `Admin user not found`.
- Añadido `findFirstAdmin()` en `users.repo.ts`: `SELECT * FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`.
- El endpoint ahora usa `findFirstAdmin()`.
- Archivos: `apps/backend/src/repositories/users.repo.ts`, `apps/backend/src/routes/setup/index.ts`

### Formateo de partición falla con error vacío
- `mkfs` fallaba en `/dev/sdbX` porque el nodo de dispositivo aún no existía cuando se intentaba formatear.
- `partprobe` + `sleep 2s` no es suficiente en algunos casos — udev no había procesado la nueva partición.
- Fix: añadido `udevadm settle --timeout=10` tras `partprobe`, seguido de un polling loop que espera hasta 10s a que `/dev/sdbX` aparezca como dispositivo de bloque (`test -b`).
- También se expone `stdout` en el mensaje de error de `mkfs` (antes solo `stderr`), lo que facilitó el diagnóstico.
- Archivo: `apps/backend/src/services/setup-pool.service.ts`

### Formateo en paralelo
- Los discos se formateaban secuencialmente (`for...of` + `await`).
- Cambiado a `Promise.all(disks.map(...))` para formatear todos los discos a la vez.
- Archivo: `apps/backend/src/services/setup-pool.service.ts`

### Wizard redirige al dashboard tras completar
- Al pulsar "Ir al dashboard", `mutateAsync()` resolvía pero `onSuccess` (que hace `setQueryData`) se procesaba de forma asíncrona en React Query. Para cuando `navigate('/')` disparaba y `SetupGuard` leía el cache, aún podía tener `complete: false`, rebotando de vuelta al wizard.
- Fix: `handleFinish` llama a `queryClient.setQueryData(['setup', 'status'], { complete: true })` síncronamente justo antes de `navigate('/')`, garantizando que `SetupGuard` vea el setup como completo.
- Archivo: `apps/frontend/src/views/setup/SetupWizard.tsx`

### Verificado
- `pnpm -r typecheck` → 0 errores

---

## 2026-04-14 — Fase 10: Fixes de badblocks y wizard

### Barra de progreso de badblocks se quedaba en 0%
- `badblocks -v` escribe el progreso en stderr con `\r` para sobreescribir la misma línea. Al spawnearlo desde Node.js con execa (que usa un pipe, no una TTY), glibc pone stderr en modo bloque-buffered y no manda nada al pipe hasta que el buffer de 8KB se llena. Para un disco grande eso puede tardar horas.
- Fix: wrapeamos con `stdbuf -eU badblocks ...` para forzar stderr completamente sin buffer. Cada write de badblocks llega inmediatamente al pipe de Node.
- Archivo: `apps/backend/src/services/storage.service.ts`

### Botón "Continuar" directo si la interfaz ya tiene IP
- En el paso de red del wizard, si la interfaz seleccionada ya tiene una IP asignada, el botón principal mostraba siempre "Guardar y continuar" aunque no hubiera nada que cambiar.
- Fix: se añade estado `userEdited` que se activa solo cuando el usuario toca los selectores DHCP/estático. Se calcula `canContinueDirectly = (interfaz tiene IP && !userEdited) || saved`. Si es `true`, el botón es "Continuar" y llama directamente a `onNext()`.
- Archivo: `apps/frontend/src/views/setup/SetupWizard.tsx`

### POST /setup/complete devolvía 400
- El endpoint `POST /api/setup/complete` recibía `Content-Type: application/json` sin body. Fastify v5 rechazaba la petición con 400 antes de llegar a la ruta. El error se tragaba silenciosamente (`catch {}`), `setup_complete` nunca se escribía en BD y el wizard volvía a aparecer en cada recarga.
- Fix: enviar `body: '{}'` en la llamada desde el frontend.
- Archivo: `apps/frontend/src/api/setup.ts`

### mkfs.xfs no encontrado — formato de discos falla con error vacío
- `xfsprogs` no estaba instalado. El servicio systemd tiene PATH mínimo sin `/sbin`, así que `mkfs.xfs` y `mkfs.ext4` tampoco se encontraban aunque estuvieran instalados.
- Fix: instalar `xfsprogs` en la sesión + añadirlo al `install.sh`. Usar rutas absolutas `/sbin/mkfs.xfs` y `/sbin/mkfs.ext4` en `setup-pool.service.ts`.
- Archivos: `apps/backend/src/services/setup-pool.service.ts`, `install.sh`

### stdbuf flag incorrecto (-eU → -e0)
- El flag para stderr sin buffer en `stdbuf` es `0` (cero), no `U`. Corregido.
- Archivo: `apps/backend/src/services/storage.service.ts`

---

## 2026-04-14 — Fase 11: Storage UX — SnapRAID, MergerFS y caché

### SnapRAID mostraba INACTIVO aunque estuviera configurado
- El badge "INACTIVO" salía siempre que no había operación en curso, incluso con `/etc/snapraid.conf` presente.
- Fix: campo `configured` en `SnapRaidStatus` (comprueba existencia de `/etc/snapraid.conf`). Badge muestra verde "LISTO" cuando configurado+inactivo, gris "NO CONFIGURADO" si no hay config.
- Archivos: `packages/shared/src/schemas/storage.schema.ts`, `apps/backend/src/services/storage.service.ts`, `apps/frontend/src/views/storage/SnapRaidCard.tsx`

### MergerFS aparecía como NO MONTADO
- El mount del v2 usaba path `/mnt/storage` y source `1:7` (formato de número de dispositivo). El backend buscaba solo en `/mnt/pool` y parseaba el source como paths.
- Fix: escanear cualquier entrada `fuse.mergerfs` en `/proc/mounts` sin hardcodear el path. Si el source no empieza por `/`, escanear `/mnt/disks/*` directamente para obtener los discos contribuyentes.
- Archivo: `apps/backend/src/services/storage.service.ts`

### MergerFS no mostraba el disco de caché
- `drives` era `string[]` (solo paths). No distinguía caché de datos ni mostraba uso por disco.
- Fix: `drives` pasa a `MergerFSDrive[]` con campos `{path, role, totalBytes, usedBytes}`. Role se infiere del nombre (`cache*` → caché, `disk*` → datos). La tarjeta muestra badge Caché/Datos y uso individual por disco.
- Archivos: `packages/shared/src/schemas/storage.schema.ts`, `apps/backend/src/services/storage.service.ts`, `apps/frontend/src/views/storage/MergerFSCard.tsx`

### Tamaños de disco con decimales (512.11 GB → 512 GB)
- `formatBytes` tenía `decimals = 2` por defecto.
- Fix: cambiado a `decimals = 0`.
- Archivo: `apps/frontend/src/lib/utils.ts`

### Botón "Crear tareas automáticas" en SnapRAID
- Crea 3 tareas en el Scheduler con un click: vaciado de caché (5:00), sync (6:00), scrub domingos (7:00). El orden es importante: caché primero para que SnapRAID calcule la paridad con los datos ya en el HDD. Los paths se detectan del estado real de MergerFS, no hardcodeados.
- Archivo: `apps/frontend/src/views/storage/SnapRaidCard.tsx`

### Botón "Vaciar caché ahora" en MergerFS
- Nuevo endpoint `POST /api/storage/mergerfs/drain` que ejecuta `rsync --remove-source-files` usando los paths detectados automáticamente. El botón solo aparece si hay un disco de caché detectado.
- Archivos: `apps/backend/src/routes/storage/index.ts`, `apps/backend/src/services/storage.service.ts`, `apps/frontend/src/views/storage/MergerFSCard.tsx`

---

## 2026-04-14 — Fase 12: Explorador de archivos — locations dinámicas

### El explorador mostraba todos los discos internos de /mnt/
- `ROOT_PATHS = ['/mnt/']` causaba que la barra lateral mostrara todos los subdirectorios de `/mnt/`: `disks/cache1`, `disks/disk1-7`, `parity1`, `parity2`, `pool`, `sdb`, `storage`, etc. El usuario veía la estructura interna del NAS en vez de solo el pool de datos.
- Fix: nuevo endpoint `GET /api/files/locations` que lee `/proc/mounts` y devuelve solo los puntos de montaje con `fstype = fuse.mergerfs`. El frontend usa esos paths dinámicamente para la barra lateral. Si no hay ningún mergerfs (entorno dev), fallback a `/mnt/`. No hay nada hardcodeado — cada cliente ve solo sus propios pools.
- La barra lateral ahora muestra cada pool con icono de disco duro y el nombre del punto de montaje como label (ej: "storage"). El explorador navega al primer pool detectado automáticamente al cargar.
- Archivos: `apps/backend/src/services/files.service.ts` (`getFileLocations()`), `apps/backend/src/routes/files/index.ts` (ruta `/locations`), `apps/frontend/src/api/files.ts`, `apps/frontend/src/hooks/useFiles.ts` (`useFileLocations`), `apps/frontend/src/views/files/FilesView.tsx`

---

## 2026-04-15 — Fase 13: Auditoría de seguridad — fixes #1, #3 y #4

### Fix #1 — Servicio deja de correr como root
- El proceso Node.js corría como `User=root`, lo que convertía cualquier vulnerabilidad en la app en un vector de control total del sistema.
- Fix: se crea el usuario de sistema `homenas` (nologin) durante el install. El servicio systemd pasa a `User=homenas`. Para los comandos privilegiados (mount, mkfs, systemctl, smbpasswd, etc.) se añade `/etc/sudoers.d/homenas` con `NOPASSWD: ALL`.
- La función `exec()` en `apps/backend/src/lib/exec.ts` detecta automáticamente si el proceso corre como uid≠0 y prepija `sudo` — cero cambios en los 15 servicios existentes.
- Nuevos helpers: `execWithInput()` para comandos que necesitan stdin (smbpasswd), `sudoWrap()` para `execa()` directos en setup-pool.
- Puerto 443 sin root: `AmbientCapabilities=CAP_NET_BIND_SERVICE` + `CapabilityBoundingSet`.
- Hardening adicional en la unit: `NoNewPrivileges=yes`, `PrivateTmp=yes`, `ProtectKernelTunables=yes`, `ProtectKernelModules=yes`, `LockPersonality=yes`, `RestrictRealtime=yes`.
- Archivos: `install.sh`, `apps/backend/src/lib/exec.ts`, `apps/backend/src/services/setup-pool.service.ts`, `apps/backend/src/routes/setup/index.ts`

### Fix #3 — Path traversal mediante symlinks
- `validatePath()` usaba `normalize()` pero no resolvía symlinks. Un atacante con acceso al explorador podía crear un symlink dentro de `/mnt/` apuntando a `/etc/shadow`.
- Fix: nueva función `validateRealPath()` que tras normalizar llama a `realpath()` y re-verifica que el path resuelto siga dentro de `ALLOWED_ROOTS`. `listDirectory()` y `getFileInfo()` usan esta versión. Las operaciones de escritura sobre paths nuevos siguen usando `validatePath()` (realpath falla si el path no existe aún).
- Archivo: `apps/backend/src/services/files.service.ts`

### Fix #4 — Detección de IP fiable para certificado TLS
- `hostname -I | awk '{print $1}'` podía devolver la IP del bridge de Docker o una interfaz inactiva, causando errores de "certificate mismatch" en el navegador.
- Fix: `ip route get 1.1.1.1` identifica la interfaz por la que sale el tráfico real. Fallback a `hostname -I` si falla. El certificado incluye ahora SAN con IP, `DNS:homenas` y `DNS:localhost`.
- Archivo: `install.sh`

### Fixes descartados de la auditoría
- **#2 Ruta server.js**: el audit sugería `dist/server.js` pero la ruta real es `dist/apps/backend/src/server.js` (TSC replica la estructura de directorios sin `rootDir` explícito). Falso positivo.
- **#5 HttpOnly cookies**: overkill para un NAS de red local. El riesgo XSS en LAN es muy bajo y la migración es costosa.
- **#6 `$(which node)` en systemd**: se evalúa en el momento de escribir el archivo de servicio (heredoc), no en runtime. El archivo `.service` resultante ya tiene la ruta absoluta. Falso positivo.

---

## 2026-04-15 — v3.1.2: Fix upload EACCES + sistema de logs en memoria

### Bug corregido: subida de archivos falla con EACCES al mover a /mnt/storage

- **Causa raíz**: el handler de upload usaba `rename()` + fallback `copyFile()+unlink()` de Node.js. Estas llamadas corren bajo el usuario del proceso (`homenas`), que no tiene permisos de escritura directa en `/mnt/storage` porque mergerfs monta con `default_permissions,group_id=0` — FUSE presenta todos los inodos como `gid=0` (root), por lo que el kernel deniega el write del usuario `homenas` aunque `/mnt/storage` sea `drwxrwsr-x root:sambashare`.
- **Fix**: se reemplaza `rename/copyFile/unlink` por `exec('mv', [src, dst])`. La función `exec()` de `lib/exec.ts` inyecta `sudo` automáticamente cuando el proceso no es root, por lo que el `mv` se ejecuta como root y la restricción de FUSE no aplica.
- **Efecto secundario positivo**: `mv` maneja internamente los saltos de filesystem (EXDEV), eliminando la necesidad del bloque try/catch de EXDEV.
- Archivos: `apps/backend/src/routes/files/index.ts`

### Nuevo: sistema de logs en memoria (`/api/system/logs`)

- Creado `apps/backend/src/lib/log-store.ts`: buffer circular de hasta 500 entradas (`LogEntry[]` con `ts, level, ctx, msg, data`). API pública: `logInfo/logWarn/logError(ctx, msg, data?)`, `getEntries({level?, ctx?, limit?})`, `clearEntries()`.
- El error handler global de Fastify (`setErrorHandler`) registra todos los errores 4xx/5xx en el store, incluyendo URL, método y stack trace.
- El handler de upload registra errores con contexto `'upload'` (parse fail, mv fail) y confirmación de éxito.
- Nuevos endpoints:
  - `GET /api/system/logs?level=error&ctx=upload&limit=100` — devuelve entradas recientes filtradas, más reciente primero.
  - `DELETE /api/system/logs` — limpia el buffer (útil tras investigar un problema).
- Archivos: `apps/backend/src/lib/log-store.ts`, `apps/backend/src/routes/system/info.ts`, `apps/backend/src/app.ts`

### Verificado
- `pnpm -r typecheck` → 0 errores

---

## 2026-04-15 — v3.1.3: Fix definitivo upload EACCES (fstab mergerfs + revert código)

### Diagnóstico del fallo en v3.1.2
- `exec('mv')` usaba sudo, pero sudo fallaba con `unable to change to root gid` porque `CapabilityBoundingSet=CAP_NET_BIND_SERVICE` en la unit de systemd impide que los procesos hijos escalen capabilities — sudo no puede hacer setgid a root.
- Causa raíz real del EACCES: la opción `defaults` en la línea de mergerfs de `/etc/fstab` añadía `nosuid,nodev` al mount FUSE y dejaba el estado del filesystem en un modo que denegaba writes al grupo sambashare. Al remontar sin `defaults`, los writes como homenas (gid=985=sambashare) funcionan correctamente.

### Fix aplicado
1. **fstab en el NAS**: eliminado `defaults,` de la línea mergerfs. Línea resultante: `allow_other,use_ino,func.create=ff,moveonenospc=true,minfreespace=4G,fsname=mergerfs,nofail`.
2. **Código**: revertido de `exec('mv')` a `copyFile + unlink` de Node.js (corre como homenas, sin sudo). homenas tiene write en `/mnt/storage` a través del grupo sambashare con el mount correcto.
3. El log-store sigue registrando errores de upload con contexto `'upload'` para diagnóstico futuro.

### Verificado
- `sudo -u homenas touch /mnt/storage/.test_write` → OK tras el remount
- `pnpm -r typecheck` → 0 errores

---

## 2026-04-15 — v3.1.4: Fix CapabilityBoundingSet + Storage/MergerFS visibles

### Problema
`CapabilityBoundingSet=CAP_NET_BIND_SERVICE` en la unit de systemd limitaba las capabilities de TODOS los procesos hijos del servicio a solo `CAP_NET_BIND_SERVICE`. Esto bloqueaba los syscalls `setuid`/`setgid` de sudo, haciendo que TODOS los comandos privilegiados fallaran silenciosamente:
- `/api/storage/disks` → `[]` (lsblk via sudo fallaba)
- `/api/storage/mergerfs/status` → `mounted: false` (cat /proc/mounts via sudo fallaba)
- Upload → `sudo: unable to change to root gid` (mv via sudo fallaba)

### Fix
Eliminado `CapabilityBoundingSet` de la unit de systemd y del `install.sh`. `AmbientCapabilities=CAP_NET_BIND_SERVICE` se mantiene (necesario para el puerto 443). El modelo de seguridad de homenas ya usa `NOPASSWD:ALL` en sudoers, por lo que el bounding set no añadía protección real y sí rompía toda la funcionalidad privilegiada.

Fix aplicado directamente en el NAS + en `install.sh` para instalaciones nuevas.

### Resultado
- `/api/storage/disks` → 3 discos (NVMe SSD cache1, ST3500418AS HDD paridad, Samsung SSD datos)
- `/api/storage/mergerfs/status` → `mounted: true, mountPoint: /mnt/storage`
- Upload de archivos → funcional

---

## 2026-04-15 — v3.1.5: Iconos oficiales en HomeStore

### Cambio
Todos los iconos de apps del HomeStore sustituidos de emojis a logos oficiales vía CDN `dashboard-icons` (walkxcode), el pack de iconos estándar del ecosistema homelab (usado por Dashy, Homarr, Homepage, etc.).

- URL base: `https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/{app}.png`
- Apps: plex, jellyfin, immich, qbittorrent, sonarr, radarr, prowlarr, overseerr, nextcloud, gitea, pi-hole, nginx-proxy-manager, vaultwarden, portainer, grafana, influxdb, home-assistant, node-red
- Frontend: nuevo componente `AppIcon` que detecta si `icon` es URL → `<img>` con fallback `onError`. Si es emoji → `<span>`. Tres tamaños: `sm / md / lg`.
- Archivos: `apps/backend/src/services/homestore.service.ts`, `apps/frontend/src/views/homestore/HomeStoreView.tsx`

---

## 2026-04-15 — v3.1.6: HomeStore — grid plano sin agrupado por categoría

- Eliminado el agrupado por secciones (Media / Download / Storage / …). La vista muestra todas las tarjetas en un grid plano.
- Los botones de filtro por categoría en la barra de búsqueda ya cubren esa función.
- Eliminada la lógica `grouped` (Map por categoría) que ya no se usaba.
- Archivo: `apps/frontend/src/views/homestore/HomeStoreView.tsx`

---

## 2026-04-15 — v3.1.7: Banner de actualización disponible en el sidebar

- El sidebar consulta `GET /api/updates/status` cada 5 minutos.
- Si `app.pendingCommits.length > 0`, aparece un banner indigo con punto pulsante justo encima del bloque de usuario/logout.
- El banner es clickable y navega a `/system` (donde está el botón OTA).
- En sidebar colapsado solo muestra el punto pulsante (sin texto).
- Archivo: `apps/frontend/src/components/layout/Sidebar.tsx`

---

## 2026-04-15 — v3.4.0: Traducciones completas + fix total de colores modo claro

### Colores modo claro — fix completo
- Reemplazo masivo de `text-{color}-400` → `text-{color}-600 dark:text-{color}-400` en 43 archivos
- Cubre: indigo, blue, purple, violet, teal, cyan, amber, yellow, red, emerald, orange, pink, lime, rose, fuchsia, gray
- Todos los textos de acento, badges e iconos ahora son legibles en fondo blanco

### Traducciones — cobertura total
Nuevos namespaces añadidos a translations.ts: `syncthing`, `homeai`
Namespaces expandidos: `storage`, `scheduler`, `system`, `docker`, `network`

Vistas traducidas:
- `StorageView`, `DisksCard`, `MergerFSCard`, `SnapRaidCard`, `BadblocksCard` — almacenamiento completo
- `SchedulerView` — programador completo
- `SystemView` — sistema, UPS, notificaciones
- `LogsModal`, `ComposeStacksCard` — docker completo
- `SyncthingView` — sincronización completa
- `HomeAIView`, `ChatView`, `InstallCard` — HomeAI completo
- `WireguardCard`, `DDNSCard`, `CloudflareCard` — red completa

---

## 2026-04-15 — v3.3.1: Fix colores en modo claro + botón idioma

- Colores pastel (-300, -200, -100) ahora tienen variante oscura para modo claro:
  `text-indigo-300` → `text-indigo-700 dark:text-indigo-300`, etc. en todos los componentes
- Afecta botones de acción en Storage (Sync, Scrub, Check, Fix), badges de estado,
  textos de dispositivos y avisos de color en toda la app (~134 ocurrencias)
- `text-green-400` y `text-gray-300` también corregidos para modo claro
- Botón de idioma: ahora muestra el idioma ACTUAL (ES en español, EN en inglés),
  antes mostraba el idioma de destino al que iba a cambiar

---

## 2026-04-15 — v3.3.0: Internacionalización (ES/EN) + tema claro/oscuro persistentes

### Sistema de i18n
- `src/i18n/translations.ts` — objeto de traducciones completo ES/EN con 12 namespaces
- `src/i18n/useT.ts` — hook ligero que lee `lang` del uiStore
- `uiStore` — añadido `lang: 'es' | 'en'` (defecto ES) + `toggleLang()`, persistido en localStorage

### Botones en el sidebar
- Botón de tema (sol/luna): alterna entre modo oscuro y modo claro, muestra icono + texto en sidebar expandido
- Botón de idioma (globo): alterna ES↔EN, muestra el idioma al que va a cambiar
- Ambos son persistentes (localStorage via Zustand persist)

### Tema claro/oscuro funcional
- Tailwind v4: `@variant dark (&:where(.dark, .dark *))` para dark mode por clase CSS
- `AppLayout` y `LoginView` aplican la clase `.dark` al `<html>` vía `useEffect`
- `index.css`: body usa `bg-gray-50 dark:bg-gray-950` como base
- Reemplazo masivo de clases hardcoded: `bg-white/5` → `bg-black/5 dark:bg-white/5`, `text-white/50` → `text-gray-500 dark:text-white/50`, etc. en los 51 componentes
- Archivos modificados: todos los .tsx del frontend

### Traducciones aplicadas
- `Sidebar` — todos los labels de nav, botones, banners OTA
- `UpdatesCard` — todos los mensajes de estado y botones
- `LoginView` — formulario de login
- `UsersView` — títulos, tabla, roles, formularios
- `DashboardView` — todas las métricas y cabeceras de tarjetas
- `ContainersCard` — cabeceras de tabla y acciones
- `HomeStoreView` — badges de estado (partial; base lista para completar)

---

## 2026-04-15 — v3.2.0: OTA auto-reload, chunk errors, links reales de contenedores

### ErrorBoundary — auto-recarga en chunk load errors
- Detecta `Failed to fetch dynamically imported module` (chunks con hash viejo tras OTA)
- En lugar de mostrar pantalla de error, llama `window.location.reload()` automáticamente

### HomeStore — links con IP real
- El `webUrl` del backend usa `localhost` internamente; el frontend lo reemplaza por `window.location.hostname`
- Los botones de acceso a contenedores ahora apuntan a la IP real del NAS

### UpdatesCard — auto-reload + changelog tras OTA
- Al completarse una actualización de app (status `done`), muestra cuenta atrás de 5s y recarga la página
- Captura los commits pendientes antes de actualizar y los muestra como "Cambios aplicados"
- Archivos: `ErrorBoundary.tsx`, `HomeStoreView.tsx`, `UpdatesCard.tsx`

---

## 2026-04-15 — v3.1.9: Banner OTA — funcionalidad de actualización directa

- Click en el banner "Actualización disponible" muestra confirmación inline ("¿Actualizar ahora? [Sí] [No]")
- Si confirma: dispara `POST /api/updates/app` y navega a `/system` para ver el output en tiempo real
- Si sidebar está colapsado, el estado de confirmación muestra solo el icono de RefreshCw para confirmar
- Durante la actualización el banner cambia a spinner + texto "Actualizando…" (también clickable → navega a `/system`)
- El banner permanece visible mientras dure la actualización
- Archivo: `apps/frontend/src/components/layout/Sidebar.tsx`

---

## 2026-04-15 — v3.1.8: HomeStore — rutas y zona horaria corregidas

### Rutas de volúmenes
- Corregidas todas las rutas de configuración: `/opt/homenas-v3/{app}/` → `/opt/homestore/{app}/config`
- Media: `/mnt/media` → `/mnt/storage/media`; series: `/mnt/storage/media/series`; películas: `/mnt/storage/media/peliculas`
- Descargas: `/mnt/downloads` → `/mnt/storage/downloads`
- Fotos Immich: `/opt/homenas-v3/immich/upload` → `/mnt/storage/photos` (en pool MergerFS)
- Nextcloud: config → `/opt/homestore/nextcloud/config`, datos → `/mnt/storage/nextcloud`

### Zona horaria
- Todos los contenedores cambiados de `TZ: UTC` → `TZ: Europe/Madrid`

- Archivo: `apps/backend/src/services/homestore.service.ts`

---
