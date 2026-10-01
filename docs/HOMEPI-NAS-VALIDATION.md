# Actualización y comprobación real de HomePiNAS — 2026-10-01

Actualización autorizada por el usuario al ofrecer un NAS de prueba con la versión anterior y facilitar el acceso. Se encontró mediante mDNS y se verificó estrictamente la clave de host SSH contra la identidad ya conocida. No se guardaron contraseñas en archivos, informes ni Honcho; SSH funcionó con la clave existente.

Para publicación se han omitido IP, MAC, hostname, usuario personal, rutas personales e identificadores de diagnóstico. En los registros se reemplazan los bytes usados por `null`; versiones, capacidades, conteos y resultados se conservan. Son registros sanitizados de las ejecuciones descritas, no ejecuciones nuevas de los scripts adaptados.

## Referencia del equipo

- Debian13.5 ARM64, kernel6.12.75 Raspberry Pi; Node24.18.0. Código instalado `/opt/homenas-v3`, commit332d4c2/main, mismo origen que el checkout reparado.
- Servicio `homenas` ejecuta Node compilado como usuario `homenas`, puerto443/TLS. Setup ya completado, un administrador, dos tareas cloud `copy` habilitadas a medianoche; se conservaron.
- Sistema en eMMC29GB; cacheXFS477GB y seis discos ext4 de25.5TB. Pool de153TB con unos76TB ocupados. No se asumió que esos datos fueran desechables.
- Tres vistas MergerFS: `/mnt/pool`, `/mnt/pool-write`, `/mnt/pool-archive`. `/mnt/storage` es symlink a `/mnt/pool`. Rama caché NC en principal, RW en write; configuración conservada.
- MergerFS2.40.2-5, SnapRAID12.4-1 y rclone efectivo1.74.2. Temporizadores externos `homepinas-cache-mover.timer` y `homepinas-snapraid-sync.timer` conservados; no se invocaron sus operaciones para probar la aplicación.
- Había archivos locales sin seguimiento, incluido `catalog-sync.service.ts`, catálogos, certificados, datos y configuración. Se conservaron; el archivo adicional también se incluyó en la compilación del árbol preparado.

## Actualización ejecutada

1. Se transfirió el árbol local reparado excluyendo Git, dependencias del anfitrión, dist, datos, certificados y `.env`; se incluyeron los cinco agentes previamente compilados. Se preparó `/opt/homenas-repair-stage-20261001` como usuario de servicio.
2. En el NAS: `npm exec --yes --package=pnpm@9.15.9 -- pnpm install --frozen-lockfile` y `pnpm -r build` mediante ese pnpm. SQLite11.10 se compiló nativamente para Node24/ARM64. La instalación global anterior de pnpm no se sustituyó.
3. Se ejecutaron pruebas del backend en staging y, al final, en la aplicación instalada: **38/38 PASS**. Integración del agente ARM64 real con Fastify/SQLite/archivos temporales: PASS.
4. Se copió la aplicación anterior a `/var/backups/homenas-repair-20261001/application`, directorio padre root0700. Tras detener únicamente `homenas`, se refrescó la copia DB/WAL con el proceso parado. Se preservaron unidades, `.env`, certificados y todos los datos externos.
5. Se sincronizaron fuentes/dependencias/builds; se creó rama remota local `repair/audit-20261001`, sin commits ni push. Se arrancó `homenas` y comprobó salud HTTPS. El ajuste final de caché se compiló y aplicó con otro restart del mismo servicio. No se reinició el equipo.

El [script aplicado](validation/homepinas-upgrade-command.sh) es evidencia de esta operación concreta, con rutas y precondiciones específicas; los logs registran también los primeros intentos de health mientras Node arrancaba. No ejecuta el instalador, montajes ni comandos de preparación de discos.

## Pruebas reales y resultados

| Comprobación | Evidencia / resultado |
|---|---|
| Referencia antes de actualizar | Login navegador,8API y4vistas PASS; status tomaba incorrectamente `/mnt/pool-archive`. |
| Compilación y SQLite | [build ARM](validation/homepinas-build.log), [build final](validation/homepinas-build-final.log); instalación frozen y carga SQLite nativa PASS. |
| Regresiones en NAS | [backend38](validation/homepinas-backend-tests.log):38PASS,0fallos/omitidos; comandos destructivos sustituidos por fixtures incluso en NAS real. |
| Go real en ARM64 | [integración](validation/homepinas-agent-integration.log): TCP→Fastify→SQLite, archivos vacíos/multichunk, hardlinks, recuperación de base ausente y errores/manifest preservado PASS, todo temporal. |
| Interfaz y API instaladas | [browser final](validation/homepinas-browser-final.log): login y8API200,4vistas sin errores JS; principal `/mnt/pool`, seis discos y una rama cache lógica, incluso ausente su subdirectorio. |
| Archivos por API sobre pool real | [flujo completo](validation/homepinas-browser-after.log): hashes SHA256 de tres fixtures antes/después; descarga UTF-8/vacío/archivo grande, subida multipart de1MB/vacío, rename/copy/mkdir/move, verificación de contenido y borrado del directorio temporal PASS. No se leyó contenido de archivos del usuario. |
| Copia de DB | Descarga por API devuelve SQLite válida; datos permanecieron en memoria del navegador de prueba, sin publicar DB ni secretos. |
| Samba por red | SMB `storage`: mkdir/put/get/del/rmdir sobre un directorio temporal; [SHA256 origen=destino](validation/homepinas-smb.log). PASS, directorio retirado. |
| Configuración y servicios | SHA256 idénticos de `/etc/fstab`, `/etc/samba/smb.conf`, `/etc/snapraid.conf`; tres mounts y timers originales conservados; `homenas`, Samba y Docker activos. DBdir0700/DB0600; journal de errores de `homenas` sin entradas durante comprobación. |

Los [checks de navegador](validation/homepinas-browser-check.mjs) requieren `HOMENAS_TEST_ORIGIN` (origen HTTPS del NAS), `HOMENAS_TEST_USERNAME` y `HOMENAS_TEST_PASSWORD` por entorno del proceso; `CHROMIUM_EXECUTABLE` es opcional. Resuelven Playwright desde `apps/frontend/package.json`. El primero necesita los fixtures indicados, creados antes de probar, y modifica sólo ese directorio temporal; la variante [final de lectura](validation/homepinas-browser-final-check.mjs) comprueba además pool/cache sin crear datos. Ambos mantienen expectativas de la topología concreta de prueba y no son sondas universales. No contienen credenciales. Los tests generales reproducibles figuran en [REPAIR-REPORT.md](REPAIR-REPORT.md).

## Fallos adicionales encontrados en este entorno

- **Crítico, topología lsblk:** util-linux2.41 devuelve lista plana al pedir PATH sin NAME/tree; ahora se exige `--tree --bytes` y se rechaza topología ambigua/disco0bytes. Pruebas de contrato/topología independientes pasan; no se intentó formato real.
- **Alto, selección multivista:** el primer mount era archive; status/drain siguen ahora la ruta canónica del alias principal. Agregar discos con varias vistas se rechaza antes de mkfs, pues actualizar sólo una deja las otras incoherentes. Crecimiento coordinado multipool queda pendiente.
- **Medio, caché ausente:** el mover externo había retirado `cache1/pool-cache`, aunque cache1 sigue montado y getfattr anuncia la rama. Ahora status conserva la rama lógica y mide su ancestro NAS existente; rechaza root, aliases y disco ausente. Prueba independiente y respuesta final del NAS verificadas. No se recreó el directorio ni se ejecutó drain.

## Arranque, rollback y límites

Arranque comprobado: `sudo systemctl start homenas`; salud: `curl -skf https://127.0.0.1/api/health` desde NAS. Panel en `https://TEST_NAS_HOST`. Fuentes/build instalados en `/opt/homenas-v3`; la rama y cambios están sin publicar. Las actualizaciones Git rechazan el árbol modificado para proteger la reparación local.

Para volver a la referencia anterior se dispone de la copia completa indicada: detener `homenas`, apartar la aplicación actual, restaurar esa copia a `/opt/homenas-v3` y arrancar el servicio. **Rollback preparado, no ejecutado.** Restaurar la DB de la copia devuelve usuarios/configuración al momento del respaldo; hay que conservar primero cualquier cambio posterior. Los datos del pool están fuera de esa carpeta.

No se ejecutó instalador privilegiado, reboot completo, format/mkfs, badblocks write, mount/unmount, drain, sync/scrub/fix SnapRAID, transferencia cloud ni cambios de red/Docker. No se comprobó todo el contenido de76TB ni se certificó paridad. Los timers externos pueden ejecutarse según su programación previa y no participan en el lock interno de la aplicación. Estas pruebas acreditan una actualización de aplicación y flujos concretos sobre hardware real, con el alcance descrito.

## Arranque posterior observado

Durante el cierre de validación se detectó un nuevo boot a las **13:26:10**, que el coordinador no solicitó. `homenas` arrancó automáticamente a las13:26:28; salud, configuraciones, tres pools, Samba/Docker y ambos timers correctos después. El journal es volátil y no conserva el boot anterior: la causa no está determinada; se preguntó al usuario si fue manual. La comprobación [navegador posterior](validation/homepinas-browser-after-boot.log) repite login8API4vistas y asserts principal/cache. Esto acredita recuperación observada tras ese arranque; no es una prueba de apagado/reinicio controlado ni identifica su causa.

El usuario confirma que tampoco solicitó ese reinicio. Investigación posterior: no hay acciones reboot/shutdown/poweroff en audit_log durante las24h anteriores, SQLite integrity_checkOK y no hay disparadores indirectos en login/GET/navegación/tests (revisión backend_security). El watchdog60s procede del paquete RPi `/usr/lib/systemd/system.conf.d/40-rpi-enable-watchdog.conf`, no de esta reparación. Bootstatus0, get_rsts1020, sin crash records pstore, get_throttled0 y temperatura36.7°C después del boot no permiten asignar la causa ni descartar un evento anterior de alimentación/bloqueo. NRestarts homenas0, memoria actual799Mi/7.9Gi. Referencia de interpretación: [API watchdog Linux](https://docs.kernel.org/watchdog/watchdog-api.html); no se deduce causalidad de tener el watchdog activo.

Pendiente de autorización: [configuración de journal persistente](validation/homepinas-persistent-journal.conf), máximo64MB/7días, mínimo512MB libres; no instalada, watchdog conservado. Se solicita porque cambia otro servicio del NAS y el usuario prohibió modificar producción sin autorización. No se intentará provocar otro reset para reproducirlo sobre estos datos.

### Registro persistente activado con autorización

El usuario autorizó activarlo. Se instaló `/etc/systemd/journald.conf.d/60-homenas-repair-diagnostics.conf` root0644: Storage=persistent, SystemMaxUse=64M, SystemKeepFree=512M, MaxRetentionSec=7day. Se creó el directorio mediante systemd-tmpfiles, reinició únicamente journald y ejecutó flush/sync. Se escribió un marcador y recuperó con `journalctl --directory=/var/log/journal`; archivos journal presentes en disco y `journalctl --verify` PASS. Consumo11.1MB inicial y19.1MB después de crear también el journal de usuario. Journald y homenas activos, NRestarts0 de aplicación, ningún error de journald; boot13:26:10 sin nuevo reinicio. Watchdog intacto. La causa del reinicio anterior sigue sin determinar; el nuevo registro permite investigar eventos posteriores.
