# Planificación de backups reparada — 2026-10-01

**Fallo confirmado, gravedad alta:** la interfaz y SQLite almacenaban `cronExpression`/`cron_expression` en backups locales y cloud, pero ningún componente registraba ni ejecutaba esas expresiones. Una copia presentada como programada nunca se iniciaba automáticamente. Evidencia inicial: `server.ts` inicializaba sólo scheduler de comandos, cache drain y actualizaciones; `backup.service.ts` y `cloud-backup.service.ts` almacenaban cron sin consumirlo.

**Corregido y verificado:** nuevo `services/backup-scheduler.service.ts` inicializa al arrancar los jobs existentes habilitados con cron válido. Usa node-cron y los mismos `runJob`/`startTransfer` que los botones manuales, conservando tipos, opciones, formatos persistidos e interfaces. Las rutas de creación, edición, borrado y habilitación refrescan el registro; borrar un remoto cloud también elimina sus timers mediante el refresco. Los callbacks releen el job y comprueban identidad del timer para impedir ejecuciones con timers antiguos, registros deshabilitados o borrados.

Se conserva la exclusión existente de una ejecución local y una cloud simultáneas; ticks adicionales de la misma categoría durante ejecución se omiten y registran el motivo en el log. Hay protección adicional mientras un starter asíncrono sigue pendiente. Fallos al iniciar se registran como `backup-scheduler` con categoría e ID, sin convertirlos en éxito ni sobrescribir el estado de una copia que ya corre. Los runners existentes siguen persistiendo historia, éxito, fallo y cancelación de la operación real.

`lib/backup-cron.ts` valida cron antes de crear/actualizar desde los servicios. Expresiones legacy inválidas se omiten con error visible al inicializar/refrescar. `null` conserva el modo manual. Cloud sólo admite enabled 0/1; local conserva booleano. No cambian nombres de propiedades o endpoints.

Integración de `server.ts`: import e initialize después del scheduler de comandos. El cierre pertenece a `db.plugin.ts`: espera `shutdownBackupSchedules(db)` y `stopDdnsUpdater(db)` antes de cerrar SQLite. Esto corrige IR15 detectado por revisión independiente: registrar onClose en app/server antes de inicializar el plugin DB daba un orden LIFO que cerraba SQLite demasiado pronto. Shutdown destruye timers, espera starters pendientes y cancela procesos de backup en ejecución mediante las funciones existentes con la DB todavía abierta. El registro es por conexión SQLite y la aplicación sigue siendo de un único proceso.

## Pruebas

`pnpm --filter @homenas/backend exec tsx --test tests/backend-backup-cron.test.ts` — **2/2 pasan**:

1. Fastify completo + SQLite temporal + inyección de timers/runners: jobs persistidos local/cloud, enabled/manual/legacy inválido, IDs correctos, opciones tar/extraArgs conservadas, exclusión y fallos de runner, rutas reales de edición/deshabilitación/habilitación/borrado, callbacks antiguos bloqueados y shutdown.
2. Reloj **node-cron real** con expresión de segundos y SQLite en memoria: dispara job habilitado e invoca runner simulado sin ejecutar rsync/tar/rclone ni escribir datos reales.

`pnpm --filter @homenas/backend test` — **30/30 pruebas pasan** después de integrar cron. `pnpm --filter @homenas/backend typecheck` pasa.

## Límites

El cron usa la zona horaria del proceso/servidor, como node-cron por defecto. No incorpora catch-up de horarios perdidos durante apagado ni una cola de backups omitidos por exclusión. No se verificó una transferencia real ni retención de copias en esta tanda; hace falta VM desechable con rsync/tar/rclone y destinos temporales. La planificación y comunicación API→SQLite→timer→runner están verificadas; la validación de NAS/servicios reales se conserva en el informe de almacenamiento.

Archivos afectados: `src/lib/backup-cron.ts`, `src/services/backup-scheduler.service.ts`, servicios y rutas de backup/cloud-backup, `src/server.ts`, `tests/backend-backup-cron.test.ts`, este informe y actualización de `docs/storage-repair.md`.

Trabajo realizado por subagente Codex `backend_security`, aplicando las definiciones Backend Architect y Application Security Engineer ya leídas; revisión independiente coordinada por el agente raíz. No se ejecutaron comandos privilegiados ni se modificaron servicios de producción.

Revisión independiente IR15 corregida y verificada: `tests/review-cron-shutdown.test.ts` conserva la comprobación de SQLite abierta durante cancelación de backups y añade DDNS in-flight con fetch simulado; ambas regresiones pasan. Se quitaron hooks de cierre duplicados de app/server. Typecheck posterior pasa.
