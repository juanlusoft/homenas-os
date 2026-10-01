# Continuidad de reparación — 2026-10-01

Referencia original332d4c2. Rama repair/audit-20261001; publicación en main autorizada por el usuario para actualizador. Instrucciones globales AGENTS.md aplicadas, Honcho consultado/actualizado por hitos. Definiciones reales The Agents mediante subagentes Codex backend_security, frontend, storage_system e independent_review. Detalles en REPAIR-REPORT.md.

Completados backend, frontend, almacenamiento/sistema, instalación/dependencias, agente Go y revisión independiente. Baseline audit54/lintno-op/sintests; final instaladores6,backend39,frontend17PASS,Go race/vet/build/lint/typecheck e integración TCP/HTTPS/ZIP5PASS, audit0 conocido. Evidencia validation/.

Aplicación NAS actualizada desde referencia original, con instalación frozen/build SQLiteARM64/Node24, 38pruebas iniciales en NAS y posterior regresión39 del actualizador en entorno local. Backupprivado y staging documentados en HOMEPI-NAS-VALIDATION.md. Preservados datos/certs/configuración/archivos locales; sólo restart aplicación. Browserreal8API4vistas, SHA fixtures, upload/rename/copy/move/delete/DBexport y Samba remotoPASS. Configfstab/SMB/SnapRAIDidéntica, pools/timersconservados. Inventario privado guardado sólo en memoria compartida; versión pública omite identificadores.

Reinicio inesperado confirmado por usuario/agente como no solicitado: sin auditpower/journalprevio,pstorevacío/watchdogvendor60s no concluyentes. Aplicación/pools/autostart postbootPASS. Usuarioautoriza journald persistente64MB7días512MKeepFree: instalado yverificado markerendisco/verifyPASS, sinreboot ywatchdogintacto. Causaoriginalpendiente.

Para publicación: docs/harness sanitizados, gitignore runtime/secretos y merge --no-overwrite-ignore probado contra colisiónignored. Alinear NAS con commit publicado preservando archivos locales; verificar tree antes de moverHEAD, sin reset hard. Usuario autorizó ventilador50% después de publicar: drop-in fan-speed, thermal state5/10 PWM128 verificados; control térmico conservado.

Pendientes: destructivos/montajes/drain/paridad/cloud/red/Docker y plataformas nativas Windows/macOS; TOCTOUexterno,hotplug/sudoALL/APIACL/growthmultipool. No certificación completa ni ausencia de fallos. Información de conexión privada en Honcho; no contraseñas en archivos.

Cierrepublicación: código73dd2d1+doc4fab0fd publicados enmain/repair; NASmain limpioorigin/main,39testsPASS allí, archivo adicional preservado y mergeignored protegido. Ventilador50% persistente verificado1552rpm35.6°C. Sin nueva reparación confirmada abierta del grupo; reboot inexplicado anterior continúa pendiente de evidencia posterior.

Retirada solicitada AD/Active Backup: rama remove/ad-active-backup desde d15bfeb, memoria confirma pedido julio. Frontend/backend/shared independientes retirados; agenteGo/constructor/deps/instaladores/updater adaptados; tablas/migraciones y datos conservados. Frontend16/backend36 nuevas regresiones ausencia+backupvigente. Build limpio PASS; prueba navegador requiere CHROMIUM_EXECUTABLE del entorno. Revisión independiente final y despliegue pendientes. Detalles MODULE-REMOVAL.md.

Retirada publicada29303fe yNASconfirmadobrowserreal/APIs/backupcloud, hashesconfiguser preservados ydist/Goantiguosarchivados. IncidentePNPMglobal10 recursión/saturaciónSSH/web conreinicioregistrado(noordenado,causaprecisapendiente); recuperación+desplieguenpmexec9offlinePASS. Fixupdaterpin adicionalbackend37+frontend16+installers6+build/lint/HTTPSPASS eindreviewPASS, selectorrealnpmPASS. Pendiente publicarfixpin y llevaraNAS/verificarglobalfinal.

Cierre retirada: código2fdc69a instaladoNAS mainlimpio/backend37/buildPASS; browserrealrepetido auth/local/cloud200 AD/AB404/menuausentePASS; pool/pool-write/pool-archive ytimersactivos; hashesuser/systemintactos. Local59pruebas/HTTPS/typecheck/auditPASS. Todoalcance retirada implementadoverificado; causa exacta reiniciodurantebloqueopnpm pendiente yservicios/clientesexternos noretirados intencionalmente. Evidenciafinal MODULE-REMOVAL yvalidation/module-removal-*.log.

Nueva petición TX/RX y ocultarSyncthingmenú: rama fix/network-rates desde6991794. CausaNASconfirmada eth1desconectadapreferidaendashboard/eth0rutaactual con tráfico segúnAPIstats. Gráficaredhuérfana/historial atrasado; backend/frontendespecialistasencurso. Sin Syncthingdeprovision (sólomenúpedido). Informe NETWORK-RATES-REPAIR ybaselinevalidation/network-rates-before.log. Pendientes integración/review/pruebas/publicación/NAS.

TX/RX integrado: backendselectorroute+operstate,samplermonotónico1scompartido,countersstats64; frontendgráficaconectada/livehistories/ticks/reset+tasasprecisas ySyncthingNAVoculto conservandomódulo. Local67tests/build/lint/audit0/HTTPSPASS,revisorbackend42/front19PASSsinhallazgos. Pendiente publicar/desplegarNAS+leerTX/RXreales.

Cierre TX/RX/Syncthing:8349ad3 publicadoNAS mainlimpio ybuild+42tests allíPASS; browserreal dashboardeth0/RXTXpositivosAPI+DOM+gráfica/counterspositivosPASS, SyncthingNAVausente. Local67tests/lint/build/audit0/HTTPS yindreview42/19PASS. Configdatoshashesconservados; sólo restartapp,nooperacionesred/datos. HarnessRXambiguocorregidoscopegráfica,repeticiónPASS. LímiteIPv6/policyrouting/hotplugdocumentado. Evidencia NETWORK-RATES-REPAIR+validation/network-rates-*.log.
