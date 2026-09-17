# Contexto compartido Claude ↔ Codex — Cotizador Tajy

> Documento generado el 2026-09-17 consolidando observaciones de Engram (proyecto `produccion`) para que
> cualquier agente de código (Claude, Codex u otro) que retome este repo tenga el mismo contexto operativo,
> sin haber estado presente en las sesiones originales. No reemplaza `CLAUDE.md` / `docs/ESTADO_PROYECTO.md`
> / `AGENTS.md` — es un resumen narrativo de la infraestructura, deploys y bugs de sesión (jul–sep 2026).
>
> **Nota de seguridad**: al armar este handoff se excluyó deliberadamente la observación Engram #239 porque
> contiene credenciales/tokens sensibles. Ningún secreto, contraseña ni clave real aparece en este archivo.

---

## 1. Migración, VPS y deploy de producción

### CD automático del backend a la VPS (PR #76 / #77 — 2026-07-31)

Se creó `.github/workflows/deploy-backend.yml`: deploy automático del backend a la VPS tras cada push
exitoso a `main`, disparado por `workflow_run` una vez que el job "CI" termina en verde (nunca despliega
código sin tests/lint pasados). Hace SSH a `fenix@<VPS_HOST>:22`, ruta `/home/fenix/workspace/produccion`,
vía `appleboy/ssh-action`, corre el pull + rebuild + health check contra `https://api.cotizador.lat/health`
(10 reintentos / 3s).

- **Motivo**: se detectó que un permiso (`puede_editar_descuento_plan`) funcionaba en local pero no en
  producción porque el backend de la VPS no tenía CD — el redeploy era manual y había quedado desactualizado
  tras un merge. El frontend en Vercel sí se auto-despliega en cada push a `main`, generando una ventana de
  desincronización backend/frontend recurrente.
- **Primer intento del script falló**: usaba `git merge --ff-only`, que chocó con "unrelated histories" (el
  checkout de la VPS no compartía ancestro común con `origin/main` — 247 vs 350 commits divergentes).
  Confirmado con Kevin que ese checkout era un artefacto descartable sin valor propio → se cambió a
  `git fetch && git reset --hard origin/main && git clean -fd` (PR #77). Tras el fix, el workflow corrió en
  verde y se confirmó por API real que local y `api.cotizador.lat` devolvían los permisos correctos.
- **Aprendizajes**: `environment:` en docker-compose gana sobre `env_file` para la misma clave. Para
  diagnosticar sin pedir credenciales reales de Kevin, sirve comparar `/api/auth/login` de una cuenta de rol
  equivalente ya conocida. Un primer "no funciona" tras un fix puede ser solo lag de propagación del
  deploy/health check, no un bug nuevo.

### ⚠️ Bug crítico: NODE_ENV no llegaba a "production" en el contenedor → CSRF roto (PR #146 — 2026-08-04)

`docker-compose.yml` cargaba `env_file: backend/.env` en el servicio `backend`, y ese archivo en la VPS pisaba
en runtime el `ENV NODE_ENV=production` horneado en `backend/Dockerfile`. Efecto real: **todo método mutante
(POST/PUT/PATCH/DELETE) fallaba con 403 CSRF en producción**, no solo el logout — porque `esProduccion()` en
`backend/src/utils/cookies.js` solo agrega `Domain=.cotizador.lat` si `NODE_ENV === 'production'`; sin eso,
las cookies `tajy_session`/`tajy_csrf` quedaban host-only en `api.cotizador.lat`, ilegibles desde
`cotizador.lat` vía `document.cookie`.

- **Síntoma reportado**: "cerrar sesión" no funcionaba — en realidad `auth.logout()` (`frontend/shared/api.js`)
  tragaba el error 403 en un try/catch vacío y redirigía a `/login/` como si hubiera funcionado, pero la
  sesión seguía viva server-side → rebote automático de vuelta a `/cotizar/`.
- **Fix**: fijar `environment: [NODE_ENV=production]` explícito en `docker-compose.yml` (gana sobre
  `env_file`). Confirmado en vivo post-deploy (#336): `Domain=.cotizador.lat` correcto, logout ya no rebota.
- **Pendiente identificado entonces** (resuelto después en PR #390, ver sección 4): `auth.logout()` seguía
  tragando cualquier error en silencio.

### Investigación de login caído en producción (2026-08-20, #923/#924)

Se investigó sin usar credenciales reales: CORS y config de API del frontend correctos, el deploy automático
(run 32371081608) había reseteado la VPS a `a7a4f23` y pasado el health check — se descartó backend
desactualizado como causa. `/auth/login` está exento de CSRF y es el único punto que emite ambas cookies, por
lo que una prueba no autenticada no puede validar los atributos `Set-Cookie` reales. 251/251 tests backend en
verde. **Quedó pendiente** capturar un login real autorizado (Network tab) para ver status/body y
`Set-Cookie` — no se llegó a diagnosticar la causa raíz en esa sesión.

### SDD `session-httponly-cookie` (propuesta 2026-08-03, merge sin verify)

Propuesta completa (#307) para migrar el JWT de sesión de `localStorage` (vulnerable a exfiltración por XSS)
a cookie `httpOnly` con CSRF double-submit. Alcance: backend deja de devolver el JWT en el body, cookie
`httpOnly; Secure; SameSite=Lax; Domain=.cotizador.lat`; nuevo `GET /auth/me`; frontend usa
`credentials: 'include'` y deja de leer `Authorization: Bearer`. Riesgos identificados: logout forzado global
al desplegar (aceptado), desincronización de deploy backend/frontend (orden obligatorio backend→frontend).

- **Estado (#313, 2026-08-03)**: cambio completo en código y mergeado a `main` (PR #138 feat + PR #139
  docs/dep-fix), **pero falta correr `sdd-verify`** (y `sdd-archive` si corresponde) contra
  `openspec/changes/session-httponly-cookie/`. Kevin pidió explícitamente hacerlo en una sesión aparte —
  **no consta en las observaciones recuperadas que esto se haya hecho después**. Cualquier agente que retome
  el proyecto debería confirmar si ese verify/archive ya ocurrió antes de asumir el cambio cerrado.

### PR #390 mergeado a main (2026-09-16, ver detalle completo en sección 4)

Merge por squash a `main` con todos los checks en verde (Analyze JS, CodeQL, Vercel, quality). Commit final:
`7af0540`. Rama `fix/test-csrf-cookie-domain` borrada (remota y local) vía `gh pr merge --delete-branch`.
**Importante**: mergear a `main` NO despliega nada solo — `deploy-backend.yml` está deshabilitado desde
2026-09-01 (`if: false`, ver `CLAUDE.md`). El deploy a producción de este fix requiere pasos manuales
separados que en las observaciones recuperadas no constan como ejecutados contra producción (solo contra TEST,
ver sección 4).

---

## 2. Servidor TEST, Docker, Compose y Supabase

### Identidad real de los servicios en TEST (clave — corrige suposiciones iniciales)

Durante el rollout de PF-3/MRC se asumió erróneamente que la base de datos de TEST vivía en un servicio
Compose llamado `postgres` dentro del proyecto del backend. La identidad real, confirmada en vivo:

| Componente                           | Valor real                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Host TEST                            | `SRV-COTIZADOR`, IP `192.168.0.90`, usuario SSH `soporte` (no "suporte")                                                                    |
| Backend Compose                      | proyecto `cotizador-backend-test`, servicio `backend-test`, contenedor `cotizador-test-backend`                                             |
| Compose file backend                 | `/opt/cotizador/backend-test/docker-compose.yml` (requiere `BACKEND_IMAGE` exportado incluso para operaciones read-only/`config`)           |
| Override persistente                 | `/opt/cotizador/backend-test/compose-test-runtime.override.yml` (fija `NODE_ENV=test` + `COOKIE_DOMAIN`, ver sección 4)                     |
| Base de datos (Supabase self-hosted) | proyecto Compose **independiente** `supabase-test`, servicio `db`, imagen `supabase/postgres:17.6.1.136`, contenedor `cotizador-test-db`    |
| Compose Supabase                     | `/opt/cotizador/supabase-test/docker-compose.yml`: servicios `db`, `rest`, `api-gw`, `storage`                                              |
| Acceso admin DB                      | `docker compose exec -T db psql -U postgres -d postgres`                                                                                    |
| IP interna DB                        | sin puerto publicado; alcanzable por bridge IP (ej. `172.20.0.2:5432`) — **esa IP es transitoria**, cambia si se recrea el contenedor de DB |
| Frontend TEST                        | árbol estático separado en `/opt/cotizador/frontend-test`, servido por Caddy — **no se actualiza con el bundle del backend**                |
| URLs públicas                        | `https://test-web.cotizador.lat` (frontend), `https://test-api.cotizador.lat` (API/health)                                                  |

Se instaló `postgresql-client` (PostgreSQL 18.6) en el host TEST para permitir el preflight read-only vía
`psql`. Se creó un rol mínimo `pf3_preflight_ro` de solo lectura sin privilegio de ejecutar funciones de
publicación (pendiente de política de baja/remoción tras cerrar el rollout).

### Preparación local del candidato PF-3 (sin acceso a Docker local, 2026-09-02/03)

Antes de tocar la VPS, se resolvieron bloqueadores puramente locales:

- **Docker no estaba disponible en la máquina de desarrollo** en ese momento — toda verificación de imagen
  se limitó a evidencia estática (Dockerfile, `.dockerignore`) hasta que se pudo probar contra la VPS.
- CI/`package.json` fijaban Node 24, pero el `Dockerfile` usaba Node 22 → corregido a `node:24-slim`.
- El logo SVG del frontend, consumido por el renderer del PDF de Propuesta, no se empaquetaba en la imagen
  Docker (el build partía del root del repo y `.dockerignore` excluía el árbol frontend) → se agregó copia
  explícita a `/app/backend/src/assets/tajy-logo.svg`, con el renderer resolviendo esa ruta primero en
  producción y con fallback al árbol frontend solo en no-producción.
- Las migraciones 069–072 no estaban incluidas en el script de test por defecto → se agregaron scripts
  explícitos `test:migrations:pf3` (backend) y `verify:migrations:pf3` (root).
- Se armó un worktree aislado (`produccion-pf3-mrc-rollout-candidate`) con 48 archivos runtime/config/
  migración/test/UI seleccionados a mano, sin tocar `main`, para poder iterar sin comprometer el repo
  principal. Se agregó también un script SQL read-only (`verify_pf3_mrc_prerequisites_v1.sql`, transacción
  `READ ONLY` + `ROLLBACK`) para confirmar que las migraciones 066–068 ya estaban aplicadas antes de intentar
  069–072.
- Verificaciones locales que sí pasaron antes de cualquier despliegue: gate de migraciones PF-3 12/12,
  tests focalizados de la propuesta 34/34, suite completa backend 343/343.

### Flujo operativo de despliegue a TEST (patrón repetido en todo el rollout PF-3/MRC)

El patrón usado consistentemente para cada candidato nuevo en TEST, siempre con autorización explícita en
cada paso (nunca automático):

1. **Preparar** un stage local autocontenido (contexto Docker mínimo, sin secretos/migraciones/node_modules/
   Git/tests/frontend no relacionado), con manifest de hashes SHA-256 de cada archivo.
2. **Subir** el stage a `/opt/cotizador/backend-test/stages/<nombre-único>` — casi siempre a mano por Kevin
   desde su propia sesión SSH autenticada, porque la identidad SSH del agente era rechazada
   (`Permission denied (publickey)`) contra `soporte@192.168.0.90`.
3. **Preflight** read-only (`remote/preflight-test.sh`): verifica integridad del stage, imagen actual
   corriendo, labels/salud de Compose, salud HTTP, hash de la guía fuente (PDF oficial), y hashes de los
   textos publicados. Nunca muta nada.
4. **Deploy** (`remote/deploy-test-backend.sh --approve-deploy`): build de la imagen candidata con tag único
   e inmutable, recreate solo del servicio `backend-test`, con imagen de rollback preservada.
5. **Verificación independiente post-deploy**, porque el script de deploy repetidamente terminaba con
   `exit 1` antes de imprimir su línea final "PASS" por una carrera entre el healthcheck (10s start period)
   y la verificación inmediata post-`up` — **esto pasó al menos 3 veces con distintos candidatos** y siempre
   resultó ser un falso negativo: el contenedor sí llegaba a `healthy` segundos después. Regla aprendida:
   nunca reintentar el deploy solo porque no se vio el "PASS" — verificar manualmente salud de Docker + HTTP
   antes de asumir fallo, y nunca reusar un tag de imagen ya existente (el script lo rechaza).

---

## 3. Despliegues PF-3/MRC en TEST

### Bug de Caddy con bind mount tras rename atómico (2026-09-08)

Al reemplazar el directorio `/opt/cotizador/frontend-test` con un rename atómico, Caddy siguió sirviendo el
directorio viejo porque su bind mount queda atado al inodo original, no al nombre de carpeta. Se corrigió
actualizando el directorio ya montado **in place** con backup opaco, sin reiniciar Caddy (que también sirve
producción). El helper de verificación además tenía un bug: hasheaba el HTML raíz buscando un hash de JS
embebido, en vez de hashear los bytes servidos de `/propuestas/propuestas.js` — corregido para pipear
`curl` directo a `sha256sum` (capturar output de `curl` primero trunca el newline final y rompe el hash).

Tras el fix se validó end-to-end la Propuesta MRC #1 (`https://test-web.cotizador.lat/propuestas/?propuesta=1`):
Carta MRC-559 v1, suma asegurada Gs. 580.500.000, prima Gs. 2.985.000, IVA Gs. 298.500, total Gs. 3.283.000,
coberturas MRC esperadas presentes, placeholders QA "No disponible" (dato de fixture, no bug).

### Ciclo de vida del renderer-fit (r17 → r18 → declarations → renderer-fit v1/v2/v3)

Hubo varias iteraciones de candidatos de imagen en TEST, cada una gatillada por un bug de renderizado de PDF
real encontrado al intentar emitir una propuesta:

- **r17**: primer candidato con adaptador renderer. Se corrigió un preflight que fallaba por asumir mal el
  nombre del servicio Compose de la DB (ver sección 2) y por una expresión `grep` extendida mal formada /
  incompatible; también faltaba inyectar `BACKEND_IMAGE` explícitamente en cada invocación de Compose.
- **r18**: candidato con header de asegurado en MRC. Quedó corriendo como baseline en TEST.
- **declarations** (`pf3-mrc-declarations-...`): candidato para publicar las dos declaraciones juradas
  oficiales (`autorizaciones_tomador_poliza_digital`, `declaracion_jurada_origen_fondos`) vía
  `publicar_texto_propuesta` (solo ejecutable por `postgres`/`service_role`). Se detectó un mismatch de hash
  entre el PDF "oficial corregido" local y el que ya vivía en `docs/insumos/` — quedó bloqueado hasta que
  Kevin reconcilió cuál era el artefacto autoritativo antes de materializar el stage. Deploy exitoso
  (imagen `...-81b8a41915d1...`), verificado sano pese al falso "exit 1" del script.
- **renderer-fit v1/v2** (`pf3-mrc-renderer-fit-05e86393a475...`): corrección del renderer de descripción de
  riesgo. El intento de reintento de emisión de un borrador (Draft 12 / Carta 9, propuesta MRC-575, número
  reservado 6) falló con **`PF_PDF_FIT_OVERFLOW`** en `risk-description@8px` — medido en el contenedor real:
  171px de scroll vs 165px de cliente a 8px. Fix: agregar `padding-block: .1mm` a
  `.risk-columns--body .risk-description` en `backend/src/templates/propuesta/mrc.js`, verificado que reduce
  a 165/165 (sin overflow). Suite focalizada de MRC 25/25 en verde tras el cambio.
- **renderer-fit v3** (`pf3-mrc-renderer-fit-1f1d264a44a...`): empaquetó el fix de padding, con `05e863...`
  como candidato/rollback previo explícito. Preflight y deploy verificados exitosos (contenedor
  `e2e8404fcc8f`, Docker healthy, HTTP health PASS). **El reintento de emisión del Draft 12/Carta 9 quedó
  pendiente de autorización explícita** tras este deploy — no consta en las observaciones recuperadas que se
  haya reintentado y confirmado la emisión final de esa propuesta.

### Botón de emisión ambiguo (UX, 2026-09-08)

Se corrigió `frontend/propuestas/propuestas.js` para que el botón de emisión use estilo `btn-primary` +
habilitado solo cuando todos los gates de negocio (readiness, texto, guardado, sin conflictos) lo permiten;
de lo contrario `btn-outline` + `disabled` nativo. Cambio acotado a un archivo, verificado con
`node --check` + tests + `git diff --check`.

### Identidad final confirmada del baseline TEST antes del rollout de renderer-fit

Antes de promover el renderer-fit, se confirmó que TEST corría `pf3-r18-header-insured-mrc-...` desde el
commit fuente `c1c16a9...`, aislado en su propia red Docker (`app_web` + `cotizador_test_supabase_internal`),
sin bind mounts de código fuente (100% basado en imagen inmutable). La imagen activa se resuelve desde un
`.env` privado en la VPS — nunca se debe mostrar su contenido en texto plano.

---

## 4. PR #390, cookies, CSRF, login/logout (el bug más reciente y su cierre completo)

### Causa raíz (2026-09-16)

Con TEST corriendo `NODE_ENV=test` **a propósito** (para no activar el gate de negocio PF-3, que solo se
activa con `NODE_ENV=production`), el código heredado de `backend/src/utils/cookies.js` derivaba `Secure` y
`Domain` de esa misma variable `NODE_ENV`. Resultado: en TEST las cookies de sesión/CSRF quedaban host-only
en `test-api.cotizador.lat`, ilegibles desde `test-web.cotizador.lat` (subdominio HTTPS distinto) →
**todo POST/PUT/PATCH/DELETE fallaba con 403 CSRF en TEST**, incluyendo el propio logout.

Ese 403 en `POST /auth/logout` disparaba el auto-redirect genérico de `request()` en `frontend/shared/api.js`
(que trata cualquier fallo como "hay que ir a login"), limpiando la caché local y redirigiendo a `/login/`
**sin que el servidor hubiera invalidado la sesión**. Combinado con el auto-redirect de `login.js` (si detecta
sesión viva, va a `/cotizar/`), esto armaba un loop login↔logout que impedía volver a entrar en TEST — el
mismo patrón de bug que ya se había visto y arreglado en producción en agosto (#331/#336), pero reintroducido
para el entorno TEST porque ese entorno corre con `NODE_ENV` distinto a `production` deliberadamente.

### Fix — PR #390 (rama `fix/test-csrf-cookie-domain`, 2 commits)

1. `backend/src/utils/cookies.js` ya **no** deriva `Secure`/`Domain` de `NODE_ENV === 'production'`, sino de
   una nueva variable de entorno independiente **`COOKIE_DOMAIN`**. `NODE_ENV` vuelve a significar
   exclusivamente "gate de negocio PF-3", desacoplado de la configuración de cookies. `docker-compose.yml`
   (producción) declara `COOKIE_DOMAIN=.cotizador.lat` explícitamente.
2. `frontend/shared/api.js`: `logout()` ahora pasa `suppressCsrfRedirect` a `request()`, para que un 403 CSRF
   específicamente en el propio `POST /auth/logout` no dispare el redirect genérico que simulaba un logout
   exitoso sin invalidación real de sesión server-side.

Ciclo TDD verificado (RED→GREEN) con tests nuevos en `backend/src/utils/cookies.test.js` y
`frontend/shared/api.test.js`.

### Despliegue a TEST del fix (2026-09-16/17, sesión `01a0ab15-f269-75de-af2f-3c23e1d6c2db` — la más densa)

1. Se creó un **override Compose persistente** en la VPS,
   `/opt/cotizador/backend-test/compose-test-runtime.override.yml`, que fija explícitamente
   `NODE_ENV=test` + `COOKIE_DOMAIN=.cotizador.lat` (el compose base trae defaults de producción y requiere
   `BACKEND_IMAGE`). El override anterior era efímero bajo `/tmp` y se había perdido — este es el reemplazo
   durable. Contenedor recreado, health `{"status":"ok"}`.
2. Se armó el bundle de deploy `backend/tmp/pr390-cookie-domain-csrf-logout-test-stage/`. El primer intento de
   checksum en la VPS falló por un **manifest local desactualizado** (hash viejo de `preflight-test.sh` vs el
   real tras una corrección posterior) — no fue un problema de transferencia SCP. Se corrigió regenerando el
   manifest y resubiendo solo ese archivo.
3. Preflight corregido para descubrir el contenedor objetivo por labels de Compose y auto-exportar su imagen
   actual como `BACKEND_IMAGE` (antes fallaba porque un shell fresh no tenía esa variable seteada).
4. **Deploy exitoso**: imagen `cotizador-test-backend:pr390-7af054038bf5` construida y `backend-test`
   recreado. El script de deploy otra vez no imprimió su línea final "PASS" (mismo patrón de carrera ya visto
   en sección 3), pero verificación manual confirmó: imagen correcta, `health=healthy`, `NODE_ENV=test`,
   `COOKIE_DOMAIN=.cotizador.lat`, `/health` → `{"status":"ok"}`. No hizo falta rollback.
5. **Segundo bug, no relacionado al backend**: tras el deploy, el **logout seguía dando 403** en TEST. Causa:
   el frontend estático de TEST (`/opt/cotizador/frontend-test/shared/config.js`, árbol separado que **no se
   actualiza con el bundle del backend**) tenía `window.COOKIE_CSRF_NAME = 'tajy_csrf'`, mientras el backend
   en TEST emite la cookie con nombre **`tajy_test_csrf`** (distinto por entorno). `frontend/shared/api.js`
   arma el header `X-CSRF-Token` a partir de ese nombre configurado, así que el logout mandaba el header con
   el nombre de cookie equivocado → 403. Fix: corregir ese único valor en `config.js` del host TEST (sin tocar
   Docker, sin rebuild) + hard reload del navegador. Kevin confirmó login y logout funcionando correctamente
   en TEST tras esto.

### Merge a main (2026-09-16)

PR #390 mergeado por squash a `main` con todos los checks en verde (Analyze JS, CodeQL, Vercel, quality).
Commit final: **`7af0540`**. Rama borrada (remota y local).

### Pendiente explícito al cierre de esta sesión (2026-09-17)

- Mergear a `main` **no despliega nada a producción** por sí solo (recordatorio: `deploy-backend.yml`
  deshabilitado desde 2026-09-01).
- Reintentar la emisión del borrador 12 de la propuesta MRC-575 (Carta ID 9, número de propuesta reservado 6,
  snapshot hash `e8d6780e050feffd8a047b80b1b3fb6ba2247f0cda28b2de0b5985627d2c7b00`) — debe reutilizar el
  mismo borrador/snapshot/número, **sin crear otra Carta**, y solo después de que TEST tenga ambos fixes
  (cookies + logout), lo cual ya está deployado y verificado en TEST según las observaciones más recientes.
- Documentar el nombre de cookie CSRF específico por entorno (`tajy_csrf` en prod, `tajy_test_csrf` en TEST)
  para evitar que un futuro redeploy del frontend estático de TEST vuelva a desalinear ese valor.
- El script `deploy-test-backend.sh` sigue teniendo el bug de timing que le hace fallar su verificación
  post-start inmediata (falso negativo) — no se ha corregido el script en sí, solo se lo ha sabido "leer con
  desconfianza" en cada uso.

---

## Meta: cómo se armó este documento

Este archivo consolida ~65 observaciones de Engram del proyecto `produccion`, identificadas originalmente en
la observación **#1619** (una sesión anterior que buscó y agrupó estos IDs para exactamente este propósito de
handoff entre agentes). Los IDs cubiertos por tema:

- **Migración, VPS y deploy de producción**: 288, 289, 307, 313, 331, 336, 923, 924, 1607.
- **Servidor TEST, Docker, Compose y Supabase**: 1393, 1395–1397, 1399–1402, 1408, 1412, 1441, 1443, 1444,
  1504–1508, 1510, 1511.
- **Despliegues PF-3/MRC en TEST**: 1427–1431, 1438, 1449, 1467, 1472, 1491–1500, 1509, 1520, 1521, 1523–1526,
  1528, 1529, 1540, 1543, 1545–1550.
- **PR #390, cookies, CSRF, login/logout**: 1606, 1607–1615.

### IDs no recuperados

Ninguno de los IDs numéricos pedidos falló — todos existían y se recuperaron con `mem_get_observation`.

Sesiones adicionales pedidas por su `session_id` (no hay una herramienta directa para "traer el detalle
completo de una sesión por id"; se resolvieron vía `mem_search` sobre las mismas observaciones ya indexadas
por tema, que ya pertenecían a esas sesiones):

- `01a08afb-1dea-73e1-a684-edfb557ff60e` → cubierta por 1491–1500, 1509.
- `01a07c29-aa63-7f44-9d07-b38ccfe21127` → cubierta por 1427–1431, 1438, 1441, 1443, 1444, 1449.
- `01a09fe2-cf50-774c-b770-38e3e71169a7` → cubierta por 1543, 1545–1550.
- `01a09054-1d64-72b2-af43-a195ba4619f8` → cubierta por 1520, 1521, 1523–1526, 1528, 1529.
- `mrc-r14-final-validation-20260902` → cubierta por 1393, 1395–1397, 1399–1402, 1408, 1412.
- `manual-save-produccion` → cubierta por 288, 289, 307, 313, 331, 336, 923, 924.

Ningún ID quedó fuera por error de herramienta. La única exclusión deliberada es la observación **#239**
(descubierta al revisar #1619), omitida de este handoff porque contiene credenciales/tokens de Engram.
