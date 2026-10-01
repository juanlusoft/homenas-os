# Continuidad de reparación — 2026-10-01

Referencia original332d4c2. Rama repair/audit-20261001; publicación en main autorizada por el usuario para actualizador. Instrucciones globales AGENTS.md aplicadas, Honcho consultado/actualizado por hitos. Definiciones reales The Agents mediante subagentes Codex backend_security, frontend, storage_system e independent_review. Detalles en REPAIR-REPORT.md.

Completados backend, frontend, almacenamiento/sistema, instalación/dependencias, agente Go y revisión independiente. Baseline audit54/lintno-op/sintests; final instaladores6,backend39,frontend17PASS,Go race/vet/build/lint/typecheck e integración TCP/HTTPS/ZIP5PASS, audit0 conocido. Evidencia validation/.

Aplicación NAS actualizada desde referencia original, con instalación frozen/build SQLiteARM64/Node24, 38pruebas iniciales en NAS y posterior regresión39 del actualizador en entorno local. Backupprivado y staging documentados en HOMEPI-NAS-VALIDATION.md. Preservados datos/certs/configuración/archivos locales; sólo restart aplicación. Browserreal8API4vistas, SHA fixtures, upload/rename/copy/move/delete/DBexport y Samba remotoPASS. Configfstab/SMB/SnapRAIDidéntica, pools/timersconservados. Inventario privado guardado sólo en memoria compartida; versión pública omite identificadores.

Reinicio inesperado confirmado por usuario/agente como no solicitado: sin auditpower/journalprevio,pstorevacío/watchdogvendor60s no concluyentes. Aplicación/pools/autostart postbootPASS. Usuarioautoriza journald persistente64MB7días512MKeepFree: instalado yverificado markerendisco/verifyPASS, sinreboot ywatchdogintacto. Causaoriginalpendiente.

Para publicación: docs/harness sanitizados, gitignore runtime/secretos y merge --no-overwrite-ignore probado contra colisiónignored. Alinear NAS con commit publicado preservando archivos locales; verificar tree antes de moverHEAD, sin reset hard. Usuarios autorizan después ventilador50%; control emc2305/two services+cron descubierto, todavía sinmodificarhasta cerrar publicación.

Pendientes: destructivos/montajes/drain/paridad/cloud/red/Docker y plataformas nativas Windows/macOS; TOCTOUexterno,hotplug/sudoALL/APIACL/growthmultipool. No certificación completa ni ausencia de fallos. Información de conexión privada en Honcho; no contraseñas en archivos.
