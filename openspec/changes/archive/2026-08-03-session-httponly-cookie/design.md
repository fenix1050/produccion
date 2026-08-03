# Design: Token de sesión en cookie httpOnly

## Technical Approach

Corte directo de **transporte**: el JWT deja de viajar en `Authorization: Bearer` y pasa a cookie `httpOnly`; el frontend deja de persistir identidad y la resuelve por `GET /auth/me`. Todo el cambio de protocolo del cliente se absorbe dentro de `frontend/shared/api.js`; los ~10 consumidores de `auth.getUsuario()` no cambian de forma, salvo los 5 guards, que pasan a esperar un bootstrap asíncrono. `token_version` intacto.

**Corrección a la propuesta**: `GET /auth/me` **ya existe** (`auth.routes.js:10`, `auth.controller.js:14`). Se **modifica**, no se crea.

## Architecture Decisions

### D1 — `res.cookie` en el controller, no en el service

**Choice**: `authService.login()` sigue puro y devuelve `{ token, csrfToken, usuario }`; `authController.login` setea las cookies y responde solo `{ usuario }`.
**Alternatives**: setear en el service (exigiría pasarle `res`).
**Rationale**: convención `routes → controllers → services → repositories`; ningún service toca `req`/`res` (`auth.service.js` recibe primitivas). Mantiene el service testeable sin fabricar `res`.

### D2 — `backend/src/utils/cookies.js` como única fuente de atributos

**Choice**: helper con `COOKIE_SESION = 'tajy_session'`, `COOKIE_CSRF = 'tajy_csrf'`, `opcionesSesion()`, `opcionesCsrf()`, `setCookiesSesion(res, token, csrf)`, `limpiarCookiesSesion(res)`.
**Alternatives**: literales inline en login y logout.
**Rationale**: `res.clearCookie` solo borra si `domain`/`path`/`sameSite`/`secure` coinciden **exactamente** con el seteo. Duplicar atributos en dos sitios es el modo de falla más probable (cookie zombie tras logout).

### D3 — CSRF en middleware propio, global por método HTTP

**Choice**: `backend/src/middleware/csrf.js`, montado en `app.js` como `app.use('/api', apiRateLimiter, csrfProtection, apiRouter)`. Salta `GET/HEAD/OPTIONS`; exime `POST /api/auth/login` (aún no existe cookie CSRF; ese endpoint ya está cubierto por `loginRateLimiter`). Comparación con `crypto.timingSafeEqual` sobre buffers de igual longitud.
**Alternatives**: dentro de `requireAuth`; opt-in por ruta.
**Rationale**: CSRF es ortogonal a authn; global-por-método garantiza cobertura sin registro ruta por ruta — riesgo explícito de la propuesta.

### D4 — `getUsuario()` sigue SÍNCRONO, hidratado una vez por carga de página

**Choice**: caché en memoria de módulo en `api.js`. Nuevo `auth.cargarSesion()` (async) llama `/auth/me` y la llena; `getUsuario()`/`tieneAccesoAdmin()`/`isLoggedIn()` siguen síncronos leyendo esa caché.
**Alternatives**: `getUsuario()` async.
**Rationale**: se invoca dentro de render síncrono en 10 sitios (`admin/render/tasas.js:21,106,211`, `planes.js:188`, `usuarios.js:122`, `admin/secciones.js:43`, `shared/sidebar.js:67`, `historial.js:125,132`, `cotizar.js:1986`, `bienvenida.js:84`). Volverlo async propaga `await` por toda la capa de render: muy por encima del presupuesto de 400 líneas y con alto riesgo de regresión visual. Cada página es un documento completo, así que "una carga = una llamada" es suficientemente fresco; la cookie es la autoridad real.
**Caveat**: `configuracion.js:28` lee `auth.getUsuario()` en la init top-level del `state` → debe moverse dentro del bootstrap (capturaría `null`). Es la única captura top-level detectada.

### D5 — Sin espejo en `localStorage`

**Choice**: se elimina `USUARIO_KEY` además de `TOKEN_KEY`.
**Rationale**: un espejo del rol en `localStorage` sigue siendo manipulable por XSS para el gating de UI y se desincroniza de `/auth/me`.

### D6 — `/auth/me` debe incluir `ultima_sesion`

`middleware/auth.js:39-52` arma `req.usuario` **sin** `ultima_sesion`, pero `configuracion.js:280` lo muestra (hoy viene del body de login). Se agrega al `req.usuario`; si no, la pantalla de Configuración regresiona.

### D7 — `PUT /auth/password` limpia cookies

Ya incrementa `token_version`, así que la cookie propia queda inválida. El controller limpia ambas cookies para no dejar al cliente en un estado "logueado" imposible.

### D8 — `cargarSesion()` traga el 401

`request()` en 401 hace `clearSession()` + redirect + `throw`. `cargarSesion()` debe capturarlo y devolver `null`, para que login (`login.js:124`) y los guards decidan, sin bucle de redirect.

## Data Flow

    POST /auth/login ──→ controller ──→ service (jwt.sign + randomBytes)
         │                   │
         │            Set-Cookie: tajy_session (httpOnly)
         │            Set-Cookie: tajy_csrf    (JS-readable)
         └── body: { usuario }   (sin token)

    Página ──→ auth.cargarSesion() ──→ GET /auth/me ──→ requireAuth (lee cookie)
         └──→ caché en memoria ──→ getUsuario() síncrono ──→ render

    Mutación ──→ api.post/put/delete ──→ header X-CSRF-Token (leído de tajy_csrf)
         └──→ csrfProtection (compara cookie vs header) ──→ requireAuth ──→ ruta

## File Changes

| File                                                                                                 | Action | Description                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/package.json`                                                                               | Modify | Dep `cookie-parser`                                                                                                                                              |
| `backend/src/utils/cookies.js`                                                                       | Create | Nombres, opciones, set/clear (D2)                                                                                                                                |
| `backend/src/middleware/csrf.js`                                                                     | Create | Double-submit global por método (D3)                                                                                                                             |
| `backend/src/app.js`                                                                                 | Modify | `cookieParser()`; `cors({ origin: FRONTEND_URL, credentials: true })`; montar `csrfProtection`                                                                   |
| `backend/src/services/auth.service.js`                                                               | Modify | Genera y devuelve `csrfToken` junto al JWT                                                                                                                       |
| `backend/src/controllers/auth.controller.js`                                                         | Modify | login setea cookies y omite `token` del body; logout y password limpian ambas                                                                                    |
| `backend/src/middleware/auth.js`                                                                     | Modify | Lee `req.cookies.tajy_session`; `algorithms:['HS256']`; agrega `ultima_sesion`                                                                                   |
| `frontend/shared/api.js`                                                                             | Modify | Quita token/usuario de `localStorage` y `authHeaders()`; `credentials:'include'` en `request` y `requestBlob`; header CSRF en mutantes; `cargarSesion()` + caché |
| `frontend/login/login.js`                                                                            | Modify | No persiste token/usuario; pre-check vía `cargarSesion()`                                                                                                        |
| `frontend/configuracion/configuracion.js`                                                            | Modify | Mover lectura de usuario (línea 28) al bootstrap (D4 caveat)                                                                                                     |
| `historial-guard.js`, `configuracion-guard.js`, `cotizar.js:374`, `admin.js:80`, `bienvenida.js:214` | Modify | `await auth.cargarSesion()` antes del gate                                                                                                                       |
| `CLAUDE.md`, `docs/ESTADO_PROYECTO.md`                                                               | Modify | Documentar el corte                                                                                                                                              |

## Interfaces / Contracts

```js
// backend/src/utils/cookies.js
export const COOKIE_SESION = 'tajy_session'
export const COOKIE_CSRF = 'tajy_csrf'
const BASE = {
  secure: true,
  sameSite: 'lax',
  domain: '.cotizador.lat',
  path: '/',
  maxAge: 45 * 60 * 1000,
}
export const opcionesSesion = () => ({ ...BASE, httpOnly: true })
export const opcionesCsrf = () => ({ ...BASE, httpOnly: false })
// clear usa las MISMAS opciones sin maxAge — cualquier divergencia deja la cookie viva
```

`POST /auth/login` → `200 { usuario }` + 2 `Set-Cookie`. `GET /auth/me` → `200 { usuario }` (incluye `ultima_sesion`) | `401`. Mutación sin/con CSRF inválido → `403`.

## Testing Strategy

Precedente: `node:test` + `t.mock.module({ namedExports })` + `req`/`res`/`next` fabricados (`auth.service.test.js:40-60`, `ramos.controller.test.js:8-19`). **No hay `middleware/auth.test.js`**: `requireAuth` se testea desde `auth.service.test.js` con el helper `correrRequireAuth` (línea 56) — ese helper es el punto RED del cambio de transporte.

| Layer        | What to Test                                                                                                                                                                     | Approach                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Unit         | `cookies.js`: paridad set/clear, `httpOnly` true/false, `maxAge` 45m                                                                                                             | Assert sobre los objetos de opciones                              |
| Unit         | `csrf.js`: GET pasa; POST sin header → 403; header ≠ cookie → 403; header = cookie → `next()`; `/auth/login` exento                                                              | Middleware puro, sin mocks                                        |
| Unit         | `requireAuth`: cookie válida OK; sin cookie → 401; `Authorization: Bearer` válido **sin** cookie → 401; token no-HS256 → 401; `token_version` desfasado → 401                    | Adaptar `correrRequireAuth` a `{ cookies: {...} }`                |
| Integration  | `authController.login` setea 2 cookies y NO expone `token`; `logout` limpia ambas + incrementa `token_version`; `/auth/me` trae `ultima_sesion`                                  | `res` fake con captura de `cookie`/`clearCookie`                  |
| E2E (manual) | Login, cotizar MRC end-to-end, panel admin, historial, PDF (`getBlob`) contra `api.cotizador.lat` + `cotizador.lat`; `document.cookie` no expone la sesión; `localStorage` vacío | Playwright — actualizar scripts QA que asumen Bearer/localStorage |

## Threat Matrix

N/A — el cambio no toca shell, subprocesos, selección de repositorio git, estado de commit/push, automatización de PR ni clasificación de archivos ejecutables. Todas las filas de `references/threat-matrix.md` son git/shell/PR. El "routing" afectado es middleware HTTP interno, cubierto por los tests de `csrf.js` y `requireAuth` de arriba.

## Migration / Rollout

Sin migración SQL. **Tensión central**: "corte directo en el código" ≠ deploy atómico. Backend (VPS, `deploy-backend.yml`) y frontend (Vercel) se disparan del **mismo** push a `main` pero terminan en momentos distintos, y **ningún orden es seguro**: backend nuevo + front viejo → el front manda Bearer y no recibe `token` en el body; front nuevo + backend viejo → 401 en todo.

| Opción                                                    | Tradeoff                                                                                                                                                                                            | Decisión    |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Dual-read transitorio (cookie **o** Bearer)               | Ventana cero, pero reintroduce el vector que el cambio elimina y exige un 3er deploy para removerlo                                                                                                 | Rechazada   |
| Dos merges ordenados (backend → frontend)                 | Ventana = tiempo humano entre merges (minutos–horas); además ambos deploys ya salen del mismo push                                                                                                  | Rechazada   |
| **Merge único de la feature branch, ventana de bajo uso** | Ventana = delta de deploys (VPS ~2-4 min vs Vercel ~1-2 min); rollback = 1 solo revert (coincide con N1 de la propuesta); falla durante la ventana = "no se puede loguear", sin corrupción de datos | **Elegida** |

Procedimiento: avisar a los agentes → mergear la feature branch → esperar `deploy-backend.yml` verde + `GET api.cotizador.lat/health` → verificar login real en `cotizador.lat`. Si el backend falla, revert inmediato (Vercel revierte solo con el commit de revert). Todas las sesiones activas se cortan: esperado, no defecto.

## División sugerida en PRs (insumo para `sdd-tasks`)

Apilados sobre `feat/session-httponly-cookie`; PR1 apunta a esa rama, cada PR siguiente al anterior. Un solo merge final a `main`.

| PR  | Alcance                                                                                                                                     | Líneas est. |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | `cookie-parser`, `utils/cookies.js` + test, `app.js` (cookieParser, CORS credentials)                                                       | ~90         |
| 2   | `middleware/auth.js` (cookie + HS256 + `ultima_sesion`), `auth.service.js` (`csrfToken`), `auth.controller.js` (set/clear), tests adaptados | ~220        |
| 3   | `middleware/csrf.js` + test + montaje                                                                                                       | ~160        |
| 4   | `frontend/shared/api.js` + `login/login.js`                                                                                                 | ~130        |
| 5   | 5 guards async + fix `configuracion.js:28` + scripts QA Playwright                                                                          | ~150        |
| 6   | Docs (`CLAUDE.md`, `ESTADO_PROYECTO.md`)                                                                                                    | ~40         |

## Open Questions

- [ ] `Domain=.cotizador.lat` rompe el desarrollo local (`localhost` + `Secure`): ¿se condiciona `domain`/`secure` por `NODE_ENV`? Necesario para que el QA local siga funcionando — resolver en `sdd-tasks`.
- [ ] ¿Se agrega `X-CSRF-Token` a `allowedHeaders` de `cors()` explícitamente, o se confía en el reflejo por defecto del paquete `cors`?
