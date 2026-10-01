# Reparación de interfaz homenas-os — 2026-10-01

Agente utilizado: subagente Codex `frontend`, siguiendo íntegramente la definición real **Frontend Developer**, `$HOME/.claude/agents/engineering-frontend-developer.md`. Ámbito exclusivo: `apps/frontend`; contratos backend/shared consultados y coordinados con agentes backend/almacenamiento. No se ejecutaron operaciones de almacenamiento real.

## Referencia y alcance

React 19, React Router, TanStack Query, Zustand, React Hook Form/Zod, TypeScript y Vite. Se revisaron el árbol de fuentes, entrada/router, guardas, clientes API, hooks de consulta/mutación, contratos shared/backend y los flujos de login/TOTP, primer arranque, almacenamiento, Docker/HomeStore, archivos, usuarios, red, planificador y backup. La revisión enfocó contratos y estados; no equivale a pruebas exhaustivas de cada control visual ni verificación de todas las integraciones NAS en hardware.

Comprobación inicial propia: `pnpm --filter @homenas/frontend typecheck` falló con `tsc: not found`: faltaban dependencias, limitación del entorno. Tras instalación coordinada, compilación/typecheck base pasaban. Los siguientes defectos estaban presentes aunque compilara. El bloqueo de autologin también se reprodujo durante las primeras pruebas de navegador, antes de su corrección.

## Hallazgos y correcciones

| ID / gravedad | Evidencia inicial e impacto | Corrección y archivos | Estado |
|---|---|---|---|
| FE-01 alta | Backend responde 401 `{requireTotp:true}`; `apiFetch` lo sustituía por `UNAUTHORIZED`. Login 2FA nunca mostraba segundo paso. | `api/client.ts`: `ApiError` conserva status/cuerpo/mensaje; `views/auth/LoginView.tsx` usa flag estructurado, limpia credenciales pendientes al volver. | Corregido y verificado en Chromium, flujo completo con API simulada. |
| FE-02 alta | Autologin cambia `isAuthenticated`, cleanup marca `cancelled` antes de `finally`; `autoLogging` queda true, wizard atascado. Reproducido como timeout del botón Empezar. | `views/setup/SetupWizard.tsx`: spinner depende exclusivamente de autenticación, conserva abort/cleanup. | Corregido y verificado en Chromium. |
| FE-03 alta | `handleFinish` ignoraba error POST complete, fijaba caché complete:true y navegaba. Ocultaba fallo de persistencia. | Wizard sólo navega al éxito; error visible y reintento. `useCompleteSetup` conserva actualización de caché sólo en éxito. | Corregido y verificado: respuesta 500 permanece wizard; reintento 200 navega. |
| FE-04 alta | Caché global conservaba datos privados tras logout/login; respuesta 401 antigua cerraba sesión recién creada. | `lib/queryClient.ts`, `main.tsx`: limpieza síncrona al cambiar sesión; `api/client.ts` invalida únicamente sesión que hizo la petición. `api/files.ts`: todas las operaciones capturan sesión al iniciar petición; `api/system.ts` y `api/active-backup.ts`: las descargas aplican la misma guarda. | Corregido y verificado cliente común/cache y seis operaciones archivos/descarga/XHR: 401 antiguo preserva sesión nueva; 401 de sesión actual cierra sesión. |
| FE-05 media | Editar IP/prefijo/gateway/DNS existentes no marcaba dirty; Continuar omitía petición. Guardar y continuar guardaba sin avanzar. | Wizard marca cada campo y cambio de interfaz, invalida saved, avanza tras éxito, muestra IP de interfaz activa. | Corregido y verificado payload/red y navegación en Chromium. |
| FE-06 alta | Confirmación de formateo seguía marcada al cambiar discos/tipo/fs; disco único admitía múltiples datos y roles paridad sin SnapRAID; discos montados/sistema podían seguir seleccionables. | Wizard restablece confirmación y bloquea configuraciones incompatibles antes de enviar y excluye discos montados (incluidos descendientes raíz detectados por backend). | Corregido y verificado cambio de discos y selección disco único; no se formatearon discos. |
| FE-07 media | `JSON.parse` en callback XHR lanzaba sin rechazar Promise: upload podía quedarse colgado. También aceptaba status fuera de 2xx. | `api/files.ts`: rechazo JSON inválido, códigos no 2xx, abort y timeout. | Corregido y verificado JSON inválido; eventos abort/timeout revisados, no ejercitados. |
| FE-08 media | Preview cron podía mostrar fechas pasadas y `Invalid Date`, ignorando días y sintaxis compleja. | `lib/cronPreview.ts`, `views/scheduler/TaskForm.tsx`: calcula sólo sintaxis simple evaluable con exactitud; expresiones complejas siguen disponibles en scheduler sin predicción falsa. | Corregido y verificado fechas futuras y omisión de expresiones no evaluadas. |
| FE-09 media | Compose invalidaba listado al iniciar, no al terminar; error de acción no se mostraba; polling inactivo nunca detectaba operación externa. | `views/docker/ComposeStacksCard.tsx`, `hooks/useDocker.ts`: refresca al terminar, muestra errores, bloquea acciones mientras ejecución, polling idle. | Corregido y verificado estado final y rechazo 409 en Chromium. |
| FE-10 media | Backup/Active Backup detenían polling al no estar running: ejecución iniciada por scheduler/otro navegador invisible. | `hooks/useBackup.ts`, `hooks/useActiveBackup.ts`: consulta cada 10s en idle, 2s ejecutando. | Corregido; compilación/typecheck verificados, scheduler externo no ejercitado. |
| FE-11 alta | Botón por partición enviaba sólo padre de disco; montaje ignoraba selección. | `api/storage.ts`, `views/storage/DiskManageModal.tsx`: body `partition` opcional, coordinado con backend/shared por agente almacenamiento. | Payload corregido y verificado en Chromium; montaje real pendiente de VM/hardware seguro. |
| FE-12 media | Headers nativos/tuplas se perdían al expandir `options.headers`; cliente forzaba JSON para cuerpos multipart. | `api/client.ts`: `Headers` nativo; JSON sólo body string, mantiene boundary FormData. | Headers/CSRF verificados Chromium; multipart upload usa XHR existente. |
| FE-13 media | Respuesta setup status null/malformada podía provocar crash/interpretación incorrecta; errores de detectar interfaces/discos parecían ausencia de hardware. | `api/setup.ts`: valida boolean completo; Wizard muestra error y opciones reintentar/saltar explícitas. | Status malformado verificado; presentación de detección revisada y compilada. |
| FE-14 alta | Selector agente sólo distinguía SO; macOS Intel y Linux ARM recibían binarios incompatibles. | `api/active-backup.ts` añade cuarto argumento arch opcional preservando llamada antigua; `views/active-backup/ActiveBackupView.tsx` ofrece Windows x86-64, Linux x86-64/ARM64, macOS Intel/Apple Silicon y nombre ZIP con arch. Backend coordinado soporta amd64/arm64. | Corregido y verificado 6 variantes API (incluido default) y 5 botones reales Chromium; ejecución del binario por plataforma corresponde validación agente/backend. |

## Pruebas y reproducción

- `pnpm --filter @homenas/frontend typecheck`: PASS.
- `pnpm --filter @homenas/frontend build`: PASS.
- `pnpm --filter @homenas/frontend test`: 17/17 regresiones PASS, 0 omitidas.
- `git diff --check apps/frontend`: PASS.

Suite `apps/frontend/tests/regressions.test.mjs` inicia Vite en puerto aleatorio de **127.0.0.1**, abre Chromium y sirve componentes, stores y clientes reales. Intercepta todas las rutas `/api/*` con fixtures; nunca llama servicios del anfitrión. Ejecuta login credenciales → challenge TOTP → sesión → navegación, bootstrap wizard → cuenta → red → almacenamiento → completar/reintentar, cache/session y errores, upload inválido, preview cron, contrato partición y operación Compose → refresco → rechazo.

Herramientas durante esta validación: Playwright 1.63.0 desde `/tmp/homenas-repair-tools/browser/node_modules/playwright/index.mjs`; Chromium headless existente. El siguiente comando conserva las opciones usadas, con la ruta personal sustituida por `$HOME` para publicación:

```sh
PLAYWRIGHT_MODULE=/tmp/homenas-repair-tools/browser/node_modules/playwright/index.mjs \
CHROMIUM_EXECUTABLE=$HOME/.cache/ms-playwright/chromium_headless_shell-1234/chrome-linux/headless_shell \
pnpm --filter @homenas/frontend test
```

Logs: `docs/validation/frontend-{regressions,build,typecheck}.log`. Capturas reales del navegador con fixtures: `docs/validation/screenshot-login.png` y `screenshot-setup.png` (sin datos/servicios del anfitrión). La advertencia Vite sobre `__dirname` anuncia cambio futuro de loader; no falla la versión instalada.

## Instalación, arranque y comprobación de interfaz

Desde raíz, una vez instaladas dependencias del workspace (ver informe principal):

```sh
pnpm --filter @homenas/frontend typecheck
pnpm --filter @homenas/frontend build
pnpm --filter @homenas/frontend exec playwright install chromium
pnpm --filter @homenas/frontend test
pnpm --filter @homenas/frontend dev --host 127.0.0.1
```

Typecheck/build/test y arranque Vite loopback ejercitados aquí. La orden descargar Chromium es la preparación reproducible cuando no hay navegador; esta máquina utilizó el Chromium existente. Desarrollo proxy `/api` espera backend en localhost:3000. Estas pruebas simulan backend y **no** certifican instalación privilegiada, autenticación end-to-end con Fastify real, servicios Docker/red, sincronización o almacenamiento físico.

## Pendientes / límites

- Montar la partición exacta, formatear/discos protegidos, shares, VPN y cambios de IP real requieren VM aislada o discos desechables; no se ejecutaron aquí.
- Backup/Active Backup iniciado externamente: polling corregido, falta prueba con scheduler/servicio real.
- Secretos de sesión siguen en sessionStorage por contrato heredado; migrar a cookie HttpOnly requeriría trabajo backend coordinado, no se presenta como reparación terminada.
- Vista NFS sólo lista exportaciones aunque existen clientes API para CRUD: ampliación opcional heredada, fuera de reparación de funcionalidades existentes.
- Pruebas usan fixtures de respuestas: ver informe backend para contratos y endpoints reales. No se afirma que esté libre de fallos o probado en hardware real.


## Seguimiento de la revisión

2026-10-01: completada reparación restante de carrera 401 en archivos, backup DB, restauración Active Backup y descarga de paquete agente. Dos regresiones Chromium ejercitan las seis operaciones con respuesta de sesión anterior después de login nuevo y con sesión actual expirada; 17/17 pruebas finales PASS. Se añadió limpieza diferida de blob URL del backup DB siguiendo el patrón existente del resto de descargas (compatibilidad Firefox, no ejecutado Firefox aquí).


2026-10-01: selección explícita arquitectura en paquete agente, coordinada con backend y builder. Regresiones API/default y botones reales del modal verifican query platform/arch: suite 17/17 PASS. Capturas anteriores conservadas.
