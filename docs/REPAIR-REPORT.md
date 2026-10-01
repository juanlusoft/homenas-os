# Reparación de homenas-os — 2026-10-01

Checkout original `332d4c2`, rama local `repair/audit-20261001`. Se conserva esta versión antigua: Fastify/SQLite, React/Vite, agente Go y servicios NAS Linux. No se ha usado el comportamiento de TiesOS moderno como especificación. Las reparaciones se prepararon en una rama separada y el usuario autorizó posteriormente su publicación en `main` para el actualizador. Posteriormente el usuario autorizó actualizar su HomePiNAS y se actualizó únicamente la aplicación, conservando discos/configuración; no hubo operaciones destructivas ni ejecución del instalador privilegiado.

## Referencia y agentes utilizados

El checkout estaba limpio. Build y typecheck iniciales pasaban, pero no había pruebas y lint no comprobaba código. Auditoría pnpm: 54 avisos (32 altos, 20 moderados, 2 bajos). Go faltaba en el entorno ARM64; se instaló un toolkit aislado con SHA256 verificado. Node 22.23.3 y pnpm 9.15.9.

The Agents tiene definiciones instaladas en `/home/jlu/agency-agents` y `/home/jlu/.claude/agents`, pero no un lanzador nativo accesible desde esta sesión. Se leyeron y aplicaron mediante los siguientes subagentes Codex reales, con archivos asignados por ámbito:

| Subagente | Definiciones leídas / trabajo |
|---|---|
| backend_security | Backend Architect, Application Security Engineer: autenticación, permisos, archivos, aplicaciones, comandos, DDNS y planificación de copias. |
| frontend | Frontend Developer: clientes HTTP, sesión, wizard, discos, Compose, formularios y pruebas Chromium. |
| storage_system | DevOps Automator, Application Security Engineer: discos, pools, red, copias, actualización y servicios. |
| independent_review | Code Reviewer, API Tester: revisión separada de implementaciones e interfaces, regresiones adicionales; hallazgos reparados y revalidados. |
| Coordinador Codex | Dependencias, instaladores, agente Go, integración real HTTP/HTTPS, compilación y documentación. |

Se aplicaron las instrucciones globales AGENTS.md suministradas por el usuario; no hay AGENTS.md propio en el checkout. Honcho consultado y actualizado por hitos. No se atribuye ejecución a modelos o agentes inexistentes.

## Hallazgos, impacto y estado

Los informes siguientes registran ubicación, gravedad, evidencia y comprobación de cada grupo. Los estados distinguen regresión aislada de validación del servicio real:

- [Backend y seguridad](backend-repair.md): bootstrap expuesto, sesiones/TOTP, escapes de archivos, firmas ejecutables, argumentos de scheduler, Compose/HomeStore, DDNS, Cloudflare y Active Directory.
- [Almacenamiento y sistema](storage-repair.md): protección de discos raíz NVMe/LVM/RAID, operaciones globales peligrosas, persistencia UUID/fstab, permisos single/MergerFS/SMB, cache drain, copias locales/cloud/Active Backup, red y actualizaciones.
- [Interfaz](frontend-repair.md): TOTP, errores de setup, sesiones/caché/401 concurrentes, confirmaciones, particiones, Compose, cron, progreso y paquetes de arquitectura.
- [Planificación de copias](cron-repair.md): cron local/cloud antes persistido sin ejecución; timers, exclusión, cambios de configuración y cierre ordenado.
- [Revisión independiente](independent-review.md): carreras adicionales de bootstrap/login/lockout, aprobación de dispositivos, sesiones expiradas, progreso push, rutas compiladas, permisos y servicios Windows, lifecycle de SQLite y streaming ZIP.

### Corregido y verificado localmente por el coordinador

| Gravedad / archivos | Fallo e impacto / evidencia de reparación |
|---|---|
| Alta; `apps/agent/internal/agent/{walker,backup,uploader,manifest}.go` | Errores de lectura/subida producían backups incompletos aparentemente correctos; archivos vacíos, cambios de igual tamaño/mtime y NAS sin base fallaban. Ahora propaga errores, verifica contenido, sube archivos que faltan, conserva manifiesto anterior ante error y publica atómicamente. Go y comunicación TCP real con SQLite/archivos temporales verifican vacíos, multichunk, hardlinks, recuperación y fallo. |
| Alta; `apps/agent/internal/agent/agent.go`, `go.mod` | Cron anterior aproximaba frecuencias incorrectamente y petición push no se consumía. Cron real y exclusión de ejecuciones; pruebas Go. |
| Alta; `apps/agent/internal/config`, `cmd/install*.go`, `main.go` | TLS aceptaba certificados sin validar; token en argumentos/unidades; config y ejecutable de servicio dependían de carpeta del usuario, escritura no atómica y SCM Windows incorrecto. CA o pin explícito, config privada estable, copia versionada protegida, escritura atómica y despacho SCM previo a flags. Pruebas Linux y cross-build de cinco targets pasan; servicio/ACL Windows y launchd macOS pendientes de ejecución nativa. |
| Alta; `install.sh`, `install-x86.sh`, `scripts/build-agent.mjs` | Versiones Node/pnpm incompatibles, rebuild SQLite con ruta errónea/root y herramientas/binarios faltantes. Rebuild como servicio con smoke SQLite y fail-fast; Node 22.12+/24+, pnpm fijo, dependencias NAS y builder Go aislado verificable. Se verificaron bloques mediante mocks y compilación; instalación privilegiada completa pendiente. |
| Alta; `apps/backend/src/routes/active-backup/index.ts` | ZIP real se bloqueaba: `await archive.finalize()` llenaba PassThrough antes de que HTTP consumiera. Finalización concurrente, propagación de error y abort al desconectar. Cinco descargas reales desde servidor compilado HTTPS pasan; timeout añadido a prueba para detectar regresión. |
| Alta; `routes/{auth,setup}/index.ts` | Cambios concurrentes de password/TOTP, revocación bootstrap y lockout tras bcrypt podían emitir sesión o sobrescribir credencial. Revalidaciones tras await y transacción síncrona; pruebas del revisor verifican 401/409/429 y ausencia de sesiones indebidas. |
| Alta; `plugins/db.plugin.ts`, `app.ts`, `server.ts` | SQLite se cerraba antes de cancelación/persistencia de copias y DDNS en curso. El dueño de DB espera ambos antes de cerrar; regresiones Fastify completo verifican orden. Directorio DB 0700 y archivo 0600. |
| Media; backend `package.json`, `app.ts`, `server.ts`, `lib/project-root.ts` | Start apuntaba a archivo inexistente; rutas API desconocidas respondían HTML y binarios/updates buscaban raíz equivocada en dist. Ruta compilada real, API404 JSON y resolución por manifest. Arranque HTTPS y paquetes reales verificados. |
| Alta; manifests y `pnpm-lock.yaml` | Actualizaciones dirigidas compatibles y overrides corrigen avisos conocidos; instalación frozen, build, pruebas y audit final sin avisos. Esto no demuestra ausencia de vulnerabilidades desconocidas. |

### Corregido pendiente de validación en otro entorno

Los guards, parsers y contratos de comandos NAS están probados con fixtures/PATH simulado, pero falta ejecutar montaje/fstab/reinicio, MergerFS/SnapRAID, Samba/NFS/AD, WireGuard/NM/dhcpcd, Docker/HomeStore, rclone remoto, Cloudflare y actualizaciones privilegiadas. Hace falta Linux Debian/Ubuntu desechable con systemd, sudo y discos virtuales o identificados expresamente como desechables. Para Windows/macOS hacen falta esos sistemas y servicios nativos; cross-build no sustituye esa prueba.

El HomePiNAS ofrecido fue localizado en el NAS de prueba; la clave SSH coincide con su identidad guardada para la dirección anterior. Se accedió y actualizó la aplicación desde el mismo commit332d4c2. Se inventariaron discos/servicios, respaldaron aplicación y DB tras cierre ordenado, y comprobaron configuraciones y hashes de archivos temporales. **Se verificaron API, navegador, archivos sobre el pool y Samba reales.** El equipo tiene unos76TB ocupados: no se probaron formato, badblocks write, drain, modificaciones de montajes ni reinicio controlado; posteriormente se observó un nuevo boot no solicitado y se verificó recuperación de servicio/pools. Su causa no consta en el journal volátil. Ver [informe HomePiNAS](HOMEPI-NAS-VALIDATION.md) para comandos/evidencia y rollback. Estas pruebas parciales no certifican paridad, cloud remota, todos los servicios ni hardware completo.

### Pendiente de reparación / riesgos conservados

- Sudoers `NOPASSWD: ALL` y control Docker dan privilegios equivalentes a root al backend/administrador. Sustituirlos requiere un broker y redefinir contratos de operaciones; no se afirma haber resuelto ese modelo.
- Persisten carreras TOCTOU si otros procesos cambian symlinks/dispositivos entre validación y comando, y la API NAS no implementa ACL por usuario/share. Las pruebas cubren escapes estáticos y exclusión dentro de un proceso.
- Identidad de selección de disco aún usa nombres `/dev/sdX` del protocolo antiguo. Topología/uso se revalidan, pero una garantía ante hotplug requiere identidad inmutable y prueba específica.
- `lib/crypto.ts` deriva clave de machine-id público y no se usa en los flujos actuales inspeccionados. Secretos persistidos en SQLite se protegen por permisos de fichero; un cifrado independiente necesita migración compatible. No se presenta esta utilidad sin uso como protección efectiva.
- No se ha certificado armhf, instalación sin red, hardware real, todas las distribuciones ni todos los endpoints. Las dependencias fijadas necesitan mantenimiento futuro.

## Comprobaciones reproducibles

Desde la raíz, con Node 22.12+ (o 24+), pnpm 9.15.9 y Chromium Playwright instalado:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm build:agent
pnpm test
pnpm lint
pnpm audit
cd apps/agent
go test -race ./...
go vet ./...
go build -o /tmp/homenas-test-agent .
cd ../..
HOMENAS_AGENT_BINARY=/tmp/homenas-test-agent pnpm test:integration
pnpm test:production
```

Si Go no está en PATH, `pnpm build:agent` obtiene Go 1.25.14 verificado bajo `.homenas-tools`; usar su `go/bin/go` para pruebas. En esta sesión se usó también `/tmp/homenas-repair-tools/go/bin/go`. Chromium alternativo se selecciona con `CHROMIUM_EXECUTABLE`. `pnpm --filter @homenas/frontend exec playwright install chromium` instala el navegador cuando falta.

Resultados y logs en [validation/](validation/): instaladores **6/6**, backend **39/39** (incluye subcasos), frontend Chromium **17/17**, Go race/vet, build/typecheck/check de shell/diff, cinco binarios cross-build, integración Go↔Fastify↔SQLite y servidor compilado HTTPS/React con login/TOTP, sesión, API404, cabeceras y descargas ZIP/SQLite. Ninguna prueba omitida en estas suites. La interfaz usa fixtures para operaciones NAS; producción usa auth y descargas reales y bloquea monitorización del anfitrión. Audit final: **0 avisos conocidos**.

## Arranque e instalación

Arranque de código compilado verificado: ejecutar desde `apps/backend`, con `HOMENAS_DATA_DIR`/`HOMENAS_LOG_DIR` en directorios privados, `HOST=127.0.0.1`, `PORT` libre y, para HTTPS, `CERT_PATH`/`KEY_PATH`, `pnpm start`. Comprobar `/api/health`; React se sirve desde el build frontend. Primer arranque genera credencial en el directorio DB, no la imprime; setup requiere acceso loopback según política reparada. No usar el proceso de prueba para operaciones de sistema del anfitrión.

Los instaladores Linux revisados crean `/opt/homenas-v3`, usuario `homenas`, unidades systemd, TLS y sudoers e instalan/configuran servicios NAS. **Su ejecución completa aún no está verificada.** Clonan/pullan GitHub; las reparaciones se publican en `main`, que es la rama que consume el actualizador. En el HomePiNAS se realizó transferencia controlada del árbol reparado, instalación frozen y compilación ARM64, conservando DB, certificados/configuración y datos.

No se afirma que esté libre de errores ni que el NAS funcione en hardware real sin esa validación.

La actualización real añade tres correcciones verificadas: topología explícita `lsblk --tree --bytes` (util-linux2.41 podía devolver lista plana), selección de pool por ruta canónica `/mnt/storage` entre múltiples vistas y medición segura de caché con rama ausente. Añadir discos en múltiples vistas se rechaza antes de formato hasta implementar crecimiento coordinado. Pruebas independientes y de NAS real constan en los informes.

## Publicación para actualizaciones

El usuario autorizó publicar en GitHub. El código y las regresiones se integran en `main`, conservando la rama de reparación. Se omiten identificadores privados del NAS en informes/logs; los harness de navegador usan variables de entorno. Estado runtime, certificados, credenciales y catálogos se excluyen de Git. El actualizador usa `--ff-only --no-overwrite-ignore`, verificado con tres repositorios temporales: rechaza colisiones con archivos locales ignorados y conserva su contenido. El checkout del NAS se alinea con el árbol publicado comprobando igualdad de tree antes de mover HEAD; archivos adicionales se conservan.
