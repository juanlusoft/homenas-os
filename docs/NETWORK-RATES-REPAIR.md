# Velocidad TX/RX y menú — 2026-10-01

El dashboard elegía `eth1` siempre que existiera, aunque estuviera desconectada. En el NAS la ruta predeterminada y el tráfico real corresponden a `eth0`: tres lecturas mostraron el dashboard con RX/TX cero, mientras `/api/network/stats` registraba tráfico positivo en eth0 y cero en eth1. Es un fallo confirmado de selección de interfaz, independiente de la retirada AD/Active Backup.

La gráfica `BandwidthChart` existía pero no estaba integrada en la página Red. Sus etiquetas leían el historial anterior a la actualización y podían mostrar una muestra atrasada. Se conserva el contrato público de tasas en bytes por segundo.

Petición adicional: retirar **sólo el enlace Syncthing del menú**. Se conserva el servicio, su configuración y las APIs/vista para no interrumpir sincronizaciones existentes.

Coordinación: subagentes Codex `backend_security` (Backend Architect/AppSec: interfaz y muestreo/pruebas), `frontend` (Frontend Developer: gráfica, menú y navegador) e `independent_review` (Code Reviewer/API Tester: revisión final). Definiciones The Agents leídas durante esta sesión; integración, publicación y validación NAS a cargo del coordinador.

Las lecturas se realizan sin modificar interfaces, rutas, discos, recursos compartidos ni trabajos de sincronización.

## Correcciones y archivos

- `apps/backend/src/services/system.service.ts`: selección de ruta IPv4 predeterminada con menor métrica y estado operativo, fallback a interfaz activa; ya no se impone eth1.
- `apps/backend/src/services/network.service.ts`: muestreo compartido monotónico y ventana de un segundo para que peticiones concurrentes no consuman el contador anterior; errores y desaparición/recreación de interfaces reinician la referencia. Lectura correcta de `ip -j -s link` (`stats64.rx.bytes`/`stats64.tx.bytes`, antes se buscaban campos planos inexistentes). Interfaces bond se conservan como interfaces utilizables.
- `apps/frontend/src/views/network/{NetworkView,BandwidthChart}.tsx`: gráfica conectada, etiquetas desde muestra actual, historial por tick sin duplicación al seleccionar, recuperación cuando desaparece una interfaz.
- `apps/frontend/src/views/dashboard/DashboardView.tsx` y `lib/utils.ts`: formato uniforme bytes/s, incluidas tasas inferiores a un byte; historial RX/TX registra tasas constantes y se reinicia al cambiar interfaz, sin cambiar el historial CPU/memoria.
- `apps/frontend/src/components/layout/Sidebar.tsx`: eliminado únicamente enlace Syncthing. Ruta, API, vista y servicio intactos.
- Regresiones: `apps/backend/tests/backend-network-rates.test.ts` y `apps/frontend/tests/regressions.test.mjs`.

Corregido y verificado localmente: **6 instaladores + 42 backend + 19 navegador = 67 pruebas**, build, lint/typecheck, auditoría sin vulnerabilidades conocidas y smoke HTTPS compilado (React/login/TOTP/exportación SQLite). El revisor independiente repitió backend42/frontend19/typecheck/diff, sin hallazgos confirmados abiertos. Logs `docs/validation/network-rates-*.log`.

Los contratos y unidades API se conservan. Primera muestra tras arranque devuelve cero hasta disponer de una segunda lectura; la caché de un segundo es intencional. Selección IPv4/default y fallback operativo probados; rutas exclusivamente IPv6 y policy routing complejo quedan sin validación en otro entorno. Publicación e instalación NAS se registran a continuación.
