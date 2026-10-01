# Retirada de Active Directory y Active Backup — 2026-10-01

Solicitada por el usuario para conservar su selección de funcionalidades anterior. Ambos módulos eran independientes de las copias locales/cloud y del servidor Samba de archivos.

## Cambios

- Eliminados menú, rutas React, vistas, hooks, clientes API y traducciones de ambos módulos (`apps/frontend`).
- Eliminadas rutas Fastify `/api/ad/*` y `/api/active-backup/*`, sus servicios, repositorio y esquema compartido exclusivo (`apps/backend`, `packages/shared`).
- Eliminado el agente cliente Go exclusivo de Active Backup (`apps/agent`), constructor, comandos y pruebas exclusivos. Instaladores y actualizador ya no requieren ni descargan Go ni construyen esos clientes.
- Retiradas dependencias exclusivas `archiver` y `@types/archiver`; lockfile regenerado y comprobado con instalación frozen.
- Copias locales/cloud, Samba, almacenamiento, autenticación y exportación SQLite conservados. Migraciones y tablas históricas se mantienen deliberadamente: no se borran configuraciones, registros ni archivos de copias anteriores. Tampoco se desinstalan servicios AD ni agentes que puedan existir en otros equipos.

La auditoría anterior queda como registro histórico: sus pruebas del agente y comandos Go ya no corresponden a esta versión.

## Agentes utilizados

Subagentes Codex con las definiciones The Agents ya leídas: `frontend` (Frontend Developer), `backend_security` (Backend Architect/AppSec) e `independent_review` (Code Reviewer/API Tester, revisión independiente). Coordinador: instaladores, dependencias, retirada Go, integración HTTPS, documentación y publicación/despliegue.

## Validación y operación

Se requiere Node 22.12+ de la rama 22 o Node 24+, pnpm 9.15.9, herramientas de compilación SQLite y Chromium para las pruebas de navegador. No se requiere Go.

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm rebuild better-sqlite3 esbuild
pnpm build
pnpm test
pnpm lint
pnpm audit
pnpm test:production
```

En este entorno Chromium se selecciona con `CHROMIUM_EXECUTABLE=$HOME/.cache/ms-playwright/chromium_headless_shell-1234/chrome-linux/headless_shell`. El intento sin esa variable falló porque el binario esperado por Playwright no estaba instalado; no fue un fallo de la aplicación.

Para actualizar una instalación existente, preservar `.env`, certificados, SQLite, copias y archivos locales; realizar merge fast-forward con `--no-overwrite-ignore`, instalar con lockfile y reconstruir. TypeScript no elimina automáticamente compilados de fuentes borradas: respaldar y limpiar únicamente `apps/backend/dist` y `packages/shared/dist` antes de compilar. Vite renueva su propio dist. Los binarios generados de `apps/agent/build` pueden archivarse fuera del checkout. Reiniciar sólo la aplicación después de compilar correctamente. Los instaladores revisados están en la raíz; no se ejecutaron privilegiados durante esta retirada.

Resultados finales de revisión, pruebas y actualización se registran a continuación.

Corregido y verificado localmente: build limpio, 6 pruebas de instaladores + 37 backend + 16 frontend Chromium, lint/typecheck, audit sin vulnerabilidades conocidas e integración HTTPS real (React, login/TOTP, APIs eliminadas404, menú y exportación SQLite). Evidencia en `docs/validation/module-removal-*.log`.

Revisión independiente final: sin hallazgos confirmados abiertos; repitió 6/36/16 pruebas y controles de tipos/shell/diff. Limitación: otras instalaciones que sólo ejecuten el actualizador pueden conservar compilados antiguos inertes; la limpieza documentada los retira. Clientes y servicios externos anteriores no se han desinstalado.

Actualización NAS verificada: rama main, build ARM64/Node24 y 36 pruebas backend iniciales; navegador contra aplicación real confirma menús ausentes, navegación local/cloud y APIs200/404. `.env`, extensión local, fstab, Samba y SnapRAID conservan sus hashes; compilados exclusivos y cinco binarios generados archivados fuera del checkout y retirados de la instalación. Servicio activo tras reconstrucción; ninguna operación sobre archivos NAS de usuario ni ejecución de jobs de copia.

Durante el primer intento se invocó el pnpm global10: se observó una cadena recursiva de procesos al seleccionar pnpm9, seguida de indisponibilidad SSH/web y un reinicio durante el bloqueo. No se ordenó reiniciar el equipo. El registro del arranque anterior no establece la causa exacta; no se afirma OOM ni watchdog como causa probada. Se recuperó el acceso y el despliegue final usó `npm exec --offline --yes --package=pnpm@9.15.9 -- pnpm`. Se corrigió además el actualizador para seleccionar explícitamente esa versión mediante npm, con regresión y revisión independiente. Para futuras actualizaciones se requiere caché npm preparada o acceso al registro. Validación final local: 6+37+16 pruebas y HTTPS PASS; selector npm real verificado por el revisor frente a un pnpm incompatible de prueba.

Cierre: fix del actualizador instalado en NAS (`2fdc69a`), build y 37/37 backend PASS allí. Repetida validación navegador contra la versión final: menús/API retirados y local/cloud intactos. Servicio y tres vistas MergerFS activos, temporizadores cache/SnapRAID activos, checkout limpio y sin fuentes/compilados/binarios de ambos módulos. No se verificaron jobs reales de backup, clientes externos ni desinstalación del servicio AD; no son necesarios para retirar estos módulos del panel. El reinicio durante la saturación queda registrado con causa precisa pendiente. En el NAS usar la invocación npm exec fijada y evitar pnpm global10 para operaciones manuales.
