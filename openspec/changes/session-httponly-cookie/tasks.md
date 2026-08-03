# Tasks: Token de sesión en cookie httpOnly

## Review Workload Forecast

| Field                   | Value                                                                 |
| ----------------------- | --------------------------------------------------------------------- |
| Estimated changed lines | ~790 total (PR1 ~90, PR2 ~220, PR3 ~160, PR4 ~130, PR5 ~150, PR6 ~40) |
| 400-line budget risk    | High (total) / Low-Medium (per PR)                                    |
| Chained PRs recommended | Yes                                                                   |
| Suggested split         | PR1 → PR2 → PR3 → PR4 → PR5 → PR6                                     |
| Delivery strategy       | auto-forecast                                                         |
| Chain strategy          | feature-branch-chain                                                  |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal                                             | Likely PR | Focused test command                                    | Runtime harness                                            | Rollback boundary                                                 |
| ---- | ------------------------------------------------ | --------- | ------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| 1    | Cookie helper + CORS/parser wiring               | PR 1      | `node --test backend/src/utils/cookies.test.js`         | N/A — pure util, no live server needed                     | `backend/src/utils/cookies.js` + `app.js` cors/cookieParser block |
| 2    | Auth transporte: cookie-based, HS256, `/auth/me` | PR 2      | `node --test backend/src/services/auth.service.test.js` | Manual `curl`/Playwright login against local backend       | `middleware/auth.js`, `auth.service.js`, `auth.controller.js`     |
| 3    | CSRF double-submit middleware                    | PR 3      | `node --test backend/src/middleware/csrf.test.js`       | Manual mutating request with/without header                | `middleware/csrf.js` + its `app.js` mount line                    |
| 4    | Frontend transport cut (`api.js`, login)         | PR 4      | Manual login smoke via Playwright                       | Playwright: login sets cookies, `/auth/me` populates cache | `frontend/shared/api.js`, `frontend/login/login.js`               |
| 5    | Async guards + QA scripts                        | PR 5      | Playwright guard-navigation smoke                       | Playwright: 5 guarded pages + Fase 2 Auto smoke            | 5 guard files + QA scripts                                        |
| 6    | Docs                                             | PR 6      | N/A                                                     | N/A — docs only                                            | `CLAUDE.md`, `docs/ESTADO_PROYECTO.md`                            |

## Phase 0: Prerequisitos

- [ ] 0.1 Regenerar índice CodeGraph (`.codegraph/` reportado corrupto): `codegraph sync` o reinit antes de tocar código. **Omitido en esta sesión de apply** — el índice existe (`.codegraph/codegraph.db`) y no bloqueó la exploración de código (se usó `Read`/`Grep` directo sobre archivos ya identificados por proposal/design). Pendiente confirmar si sigue corrupto y correr `codegraph sync` en la próxima sesión.
- [x] 0.2 Crear rama `feat/session-httponly-cookie`; cada PR de este plan apunta al PR anterior (PR1 apunta a esta rama). **Nota**: creada al final de la Fase 5 al detectar que el trabajo se había hecho directo sobre `main` sin rama — se creó la rama con todo el working tree ya modificado, sin commits previos en `main` (nada se perdió ni se pusheó).

## Phase 1 (PR1): Cookie helper + CORS/parser

- [x] 1.1 Agregar dep `cookie-parser` a `backend/package.json`.
- [x] 1.2 RED: `backend/src/utils/cookies.test.js` — paridad set/clear, `httpOnly` true/false, `maxAge` 45m, atributos condicionados por `NODE_ENV` (dev: sin `domain`, `secure:false`; prod: `domain:'.cotizador.lat'`, `secure:true`).
- [x] 1.3 GREEN: crear `backend/src/utils/cookies.js` (`COOKIE_SESION`, `COOKIE_CSRF`, `opcionesSesion()`, `opcionesCsrf()`, `setCookiesSesion()`, `limpiarCookiesSesion()`) leyendo `process.env.NODE_ENV`.
- [x] 1.4 Modificar `backend/src/app.js`: montar `cookieParser()`; `cors({ origin: FRONTEND_URL, credentials: true, allowedHeaders: [...defaults, 'X-CSRF-Token'] })` (nunca wildcard+credentials).

## Phase 2 (PR2): Transporte de sesión — backend core

- [x] 2.1 RED: adaptar `correrRequireAuth` en `backend/src/services/auth.service.test.js` para fabricar `req.cookies` en vez de header `Authorization`; casos: cookie válida OK, sin cookie 401, Bearer sin cookie 401, algoritmo no-HS256 401, `token_version` desfasado 401.
- [x] 2.2 GREEN: `backend/src/middleware/auth.js` lee `req.cookies[COOKIE_SESION]`, `jwt.verify(..., { algorithms: ['HS256'] })`, agrega `ultima_sesion` a `req.usuario`.
- [x] 2.3 RED: test de `auth.service.js` — `login()` genera y devuelve `csrfToken` (`randomBytes`) junto al JWT.
- [x] 2.4 GREEN: modificar `auth.service.js` para devolver `{ token, csrfToken, usuario }`.
- [x] 2.5 RED: test de `authController.login` con `res` fake — setea 2 `Set-Cookie`, body sin `token`.
- [x] 2.6 GREEN: `auth.controller.js` login llama `setCookiesSesion(res, token, csrfToken)`, responde `{ usuario }`.
- [x] 2.7 RED: test de `logout`/`PUT /auth/password` — `res.clearCookie` de ambas cookies + `token_version` incrementado.
- [x] 2.8 GREEN: `auth.controller.js` logout y cambio de password llaman `limpiarCookiesSesion(res)`.
- [x] 2.9 RED: test de `GET /auth/me` — incluye `ultima_sesion` en el payload.
- [x] 2.10 GREEN: `auth.controller.js` `/auth/me` devuelve `req.usuario` completo (rol, permisos, `ultima_sesion`).

## Phase 3 (PR3): CSRF double-submit

- [x] 3.1 RED: `backend/src/middleware/csrf.test.js` — GET/HEAD pasan sin header; POST sin header 403; header ≠ cookie 403; header = cookie `next()`; `POST /api/auth/login` exento.
- [x] 3.2 GREEN: crear `backend/src/middleware/csrf.js` (comparación `crypto.timingSafeEqual` sobre buffers de igual longitud).
- [x] 3.3 Montar `csrfProtection` en `app.js`: `app.use('/api', apiRateLimiter, csrfProtection, apiRouter)`.

## Phase 4 (PR4): Frontend — corte de transporte

- [x] 4.1 Modificar `frontend/shared/api.js`: eliminar `TOKEN_KEY`/`USUARIO_KEY` de `localStorage`; `credentials:'include'` en `request`/`requestBlob`; leer cookie CSRF y adjuntar `X-CSRF-Token` en POST/PUT/PATCH/DELETE; agregar `auth.cargarSesion()` (async, cachea en memoria, traga 401 → `null`) y mantener `getUsuario()`/`isLoggedIn()`/`tieneAccesoAdmin()` síncronos sobre esa caché.
- [x] 4.2 Modificar `frontend/login/login.js`: no persistir token/usuario; pre-check de sesión vía `cargarSesion()`.

## Phase 5 (PR5): Guards async + QA + consumidores

- [x] 5.1 Modificar `historial-guard.js`, `configuracion-guard.js`, `cotizar.js:374`, `admin.js:80`, `bienvenida.js:214`: `await auth.cargarSesion()` antes del gate. **Deviación/adición encontrada durante la implementación**: `historial.js` (no solo `historial-guard.js`) llama `renderApp()` de forma síncrona en su propio `init()` ANTES de que el guard's `cargarSesion()` resuelva — el sidebar (`renderSidebarFooter`/`renderTopbarUser`) lee `auth.getUsuario()` de forma síncrona en ese primer render, así que renderizaría sin usuario en el primer paint. Se agregó `await auth.cargarSesion()` también al inicio de `historial.js:init()`, y se agregó dedupe de llamadas concurrentes en `cargarSesion()` (`shared/api.js`) para que guard+página no disparen 2 `GET /auth/me` por carga (mismo patrón aplicado también en `configuracion.js`, ver 5.2).
- [x] 5.2 Modificar `frontend/configuracion/configuracion.js:28`: mover lectura de `auth.getUsuario()` del init top-level del `state` al bootstrap post-`cargarSesion()`.
- [ ] 5.3 Actualizar scripts de QA Playwright que asumen Bearer/localStorage al nuevo flujo de cookies. **No encontrados en el repo**: `grep`/`find` de `tajy_token`/lectura de `localStorage` en scripts `.js` versionados no encontró ningún script de QA committeado (consistente con el patrón del proyecto de correr Playwright ad-hoc en sesiones de QA en vivo, sin persistirlo como test suite). Nada que actualizar en el repo para esta tarea; si Kevin tiene scripts locales no versionados, deben actualizarse aparte.
- [ ] 5.4 Verificación en vivo (Playwright): login setea ambas cookies (`document.cookie` no expone la de sesión); request mutante sin `X-CSRF-Token` → 403; `/auth/me` devuelve rol/permisos/`ultima_sesion` correctos; logout limpia ambas cookies y bloquea request posterior. **Bloqueado — sin herramienta de browser/Playwright disponible en esta sesión de apply.** Se verificó el equivalente a nivel HTTP contra el backend local real (`npm run dev`, ya corriendo) con `curl`: login devuelve `Set-Cookie` de `tajy_session` con el flag `HttpOnly` (confirmado por el prefijo `#HttpOnly_` en el cookie-jar de curl) y `tajy_csrf` sin ese flag; `GET /auth/me` con cookie → 200 con `rol`/permisos/`ultima_sesion`; sin cookie o con `Authorization: Bearer <token válido>` sin cookie → 401; `PUT /auth/password` sin header CSRF → 403, con header incorrecto → 403, con header correcto → pasa el gate CSRF (401 por contraseña incorrecta, no 403); `POST /auth/logout` → 204, limpia ambas cookies (el cookie-jar de curl queda vacío) y una request posterior con la cookie vieja → 401. CORS preflight confirmado: `Access-Control-Allow-Origin` explícito (no wildcard) + `Access-Control-Allow-Credentials: true`. **Falta**: verificación real en navegador de que `document.cookie` no expone `tajy_session` (garantizado por el atributo `httpOnly` del propio estándar de cookies, pero no ejecutado literalmente contra un browser), y el flujo end-to-end de frontend (login real vía UI, cotizar MRC, panel admin, historial) contra `localhost:5000` o `cotizador.lat`.
- [ ] 5.5 Verificación en vivo (Playwright): Fase 2 Auto (pausada, comparte `frontend/shared/api.js`) sigue sin romperse — smoke de sus pantallas sin tocarlas activamente. **Bloqueado — mismo motivo que 5.4** (sin herramienta de browser disponible). Revisión estática: Auto no tiene guards/consumidores propios de `auth.*` fuera de los ya cubiertos (`cotizar.js`, `shared/sidebar.js`), así que no debería romper de forma distinta al resto del cotizador — pendiente confirmar en vivo.
- [ ] 5.6 Verificación en vivo (Playwright): los 10 call-sites síncronos de `auth.getUsuario()` (admin/render/tasas.js, planes.js, usuarios.js, admin/secciones.js, shared/sidebar.js, historial.js, cotizar.js, bienvenida.js) renderizan correctamente tras el bootstrap. **Bloqueado — mismo motivo que 5.4.** Revisión estática confirmó que los 5 entry points (`cotizar.js`, `admin.js`, `bienvenida.js`, `configuracion.js`, `historial.js`) ahora esperan `auth.cargarSesion()` antes del primer render que toca esos call-sites (ver deviación documentada en 5.1) — falta la confirmación visual real.

## Phase 6 (PR6): Documentación y cierre

- [ ] 6.1 Actualizar `CLAUDE.md` y `docs/ESTADO_PROYECTO.md`: documentar el corte de transporte, decisiones D1-D8, y el procedimiento de merge único con ventana de bajo uso. **Pendiente a propósito**: se difiere hasta después de 5.4-5.6 (verificación en vivo real) para no documentar un cierre que todavía no está confirmado end-to-end.
- [ ] 6.2 Merge único de `feat/session-httponly-cookie` a `main`; verificar `deploy-backend.yml` verde + `GET api.cotizador.lat/health` + login real en `cotizador.lat` antes de cerrar. **Fuera de alcance de esta sesión de apply** — requiere decisión explícita del mantenedor sobre la ventana de bajo uso y revisión/PR antes de mergear (regla del proyecto: nunca push directo a main). El trabajo quedó en la rama `feat/session-httponly-cookie`, sin commitear ni pushear (no se pidió explícitamente commitear en esta tarea).
