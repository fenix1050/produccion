# Proposal: Token de sesión en cookie httpOnly

## Intent

Hallazgo de la auditoría de seguridad externa (2026-08-03, misma tanda que PR #135): el JWT de sesión se guarda en `localStorage` (`frontend/shared/api.js:6-35`, escrito en `frontend/login/login.js:112-114`) y viaja como `Authorization: Bearer`. Cualquier XSS en el frontend puede leerlo y exfiltrarlo, con 45 minutos de validez y sin señal para el servidor. Migrarlo a una cookie `httpOnly` saca el token del alcance de JavaScript: un XSS podría seguir actuando en nombre del usuario dentro de la sesión activa, pero ya no puede robar la credencial.

## Scope

### In Scope

**Backend**

- `login()` (`auth.service.js:52-59`) deja de devolver el JWT en el body: lo emite como cookie `httpOnly; Secure; SameSite=Lax; Domain=.cotizador.lat; Max-Age` alineado al `expiresIn: '45m'`.
- Instalar `cookie-parser` y montarlo en `app.js`.
- `cors()` (`app.js:30`) con `credentials: true` y `origin` explícito (nunca wildcard; requisito del navegador con credenciales).
- `middleware/auth.js:14-38` lee el token de la cookie en lugar del header. Se **elimina** el soporte de `Authorization: Bearer`.
- Nuevo `GET /auth/me`: devuelve rol y permisos del usuario autenticado a partir de la cookie.
- CSRF double-submit: cookie de token CSRF legible por JS + header en cada `POST/PUT/PATCH/DELETE`, validado en un middleware backend.
- `logout()` limpia la cookie server-side (`clearCookie` con los mismos atributos).

**Frontend**

- `frontend/shared/api.js`: `credentials: 'include'` en todo fetch; se eliminan `TOKEN_KEY`, `authHeaders()` y el token de `clearSession()`; se agrega el header CSRF en métodos mutantes; se conserva el manejo de 401 → redirect a login.
- `frontend/login/login.js`: deja de persistir el token.
- Los ~8 módulos que hoy leen `auth.tieneAccesoAdmin()`/`auth.isLoggedIn()` desde `localStorage` (`cotizar.js`, `bienvenida.js`, `historial.js`, `configuracion.js`, `shared/sidebar.js`, `admin/secciones.js`, `admin/render/{tasas,planes,usuarios}.js`) pasan a resolver el usuario vía `GET /auth/me` (una llamada por vista, cacheable en memoria por sesión de página).

### Out of Scope

- `token_version` e invalidación de sesión (`incrementarTokenVersion`): sin cambios. Solo cambia el **transporte** del token.
- Resto de hallazgos Bajos/Info del informe (Dockerfile sin `USER` no-root, `incrementarTokenVersion` no atómico, errores Zod → 400, rotar el hash de admin de la migración 028).
- Refresh tokens, sesión persistente o "recordarme".
- Fase 2 (Auto): pausada, no se toca aunque comparta `frontend/shared/api.js`.

**Decisión a confirmar (no asumida):** `jwt.verify` en `middleware/auth.js` hoy no fuerza `algorithms: ['HS256']`. El archivo se toca igual en este cambio, así que agregarlo es de una línea y cierra un hallazgo Info. Se **propone** incluirlo; si se prefiere mantener el diff acotado, queda fuera.

## Capabilities

### New Capabilities

- `auth-sesion-cookie`: emisión, transporte y validación del token de sesión vía cookie httpOnly; endpoint `GET /auth/me` como fuente de identidad/permisos del frontend.
- `auth-csrf-double-submit`: protección CSRF para métodos que mutan estado.

### Modified Capabilities

- None (ninguna capability existente en `openspec/specs/` describe autenticación).

## Approach

Corte directo, sin período de doble soporte (decisión de Kevin): backend y frontend cambian de protocolo en el mismo cambio coordinado. Backend y frontend comparten dominio raíz (`api.cotizador.lat` / `cotizador.lat`), por lo que `Domain=.cotizador.lat` con `SameSite=Lax` alcanza — no se necesita `SameSite=None`. Como `SameSite` solo no cubre todos los vectores (subdominios comprometidos, navegadores viejos), se suma double-submit explícito. `trust proxy` ya está configurado (1 hop, Caddy), condición previa para que `Secure` funcione detrás del TLS terminado en Caddy.

## Affected Areas

| Área                                   | Impacto  | Descripción                                          |
| -------------------------------------- | -------- | ---------------------------------------------------- |
| `backend/package.json`                 | Modified | Dependencia `cookie-parser`                          |
| `backend/src/app.js`                   | Modified | `cookieParser()`, CORS con `credentials: true`       |
| `backend/src/services/auth.service.js` | Modified | Emisión de cookie en `login`, limpieza en `logout`   |
| `backend/src/middleware/auth.js`       | Modified | Lectura desde cookie; posible `algorithms:['HS256']` |
| `backend/src/middleware/csrf.js`       | New      | Validación double-submit                             |
| `backend/src/routes/auth.routes.js`    | Modified | `GET /auth/me`                                       |
| `backend/src/controllers/auth.*`       | Modified | Handler de `/auth/me`, respuesta de login sin token  |
| `frontend/shared/api.js`               | Modified | `credentials: 'include'`, CSRF, sin token en storage |
| `frontend/login/login.js`              | Modified | No persiste token                                    |
| ~8 módulos frontend que leen `auth.*`  | Modified | Resolución de usuario vía `GET /auth/me`             |
| `docs/ESTADO_PROYECTO.md`, `CLAUDE.md` | Modified | Registro de estado                                   |

## Risks

| Riesgo                                                                                                                                                                                | Prob. | Mitigación                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Logout forzado global**: al desplegar, toda sesión activa se corta. Es esperado y aceptado, no un defecto                                                                           | Alta  | Declararlo explícito; desplegar en ventana de bajo uso y avisar a los agentes                                                            |
| **Desincronización de deploy**: Vercel auto-despliega el frontend en push a `main`; el backend va por workflow a la VPS. Protocolos incompatibles entre ambos ⇒ nadie puede loguearse | Alta  | Orden obligatorio backend→frontend y ventana acotada; verificar `api.cotizador.lat` antes de mergear. Definir el procedimiento en design |
| Cookie no seteada por dominio/atributos mal configurados (`Domain`, `Secure`, proxy)                                                                                                  | Media | Verificar en vivo contra la VPS real, no solo en localhost (donde `Secure` se comporta distinto)                                         |
| CSRF double-submit mal implementado deja endpoints mutantes sin cubrir                                                                                                                | Media | Middleware global por método HTTP, no opt-in por ruta; test que enumere rutas mutantes                                                   |
| `GET /auth/me` por vista agrega latencia/parpadeo de UI                                                                                                                               | Media | Cachear en memoria por carga de página; render diferido de elementos gateados por permiso                                                |
| **Auto (Fase 1/2)** usa el mismo `frontend/shared/api.js` aunque esté pausado                                                                                                         | Media | No se toca su código, pero se verifica que sus vistas siguen resolviendo sesión; verificación explícita en la fase de verify             |
| Herramientas/scripts de QA (Playwright) que asumen Bearer o `localStorage`                                                                                                            | Media | Actualizar los scripts de verificación en el mismo cambio                                                                                |
| XSS sigue pudiendo actuar dentro de la sesión activa (la cookie viaja sola)                                                                                                           | Media | Reconocido: el objetivo es impedir **exfiltración**, no toda acción; CSP y sanitización quedan como roadmap aparte                       |

## Rollback Plan

- **N1 (código)**: revertir los PRs de backend y frontend **juntos y en orden inverso** (frontend primero, backend después) — un rollback parcial deja los dos lados con protocolos incompatibles.
- **N2 (datos)**: ninguno. No hay migración SQL ni cambio de schema; `token_version` queda intacto.
- **N3**: tras revertir, todas las sesiones se cortan otra vez (los usuarios vuelven a loguearse). Sin pérdida de datos.

## Dependencies

- `cookie-parser` (nueva dependencia npm en backend).
- Acceso a deploy de la VPS coordinado con el merge a `main` (el backend ya tiene workflow automático: `.github/workflows/deploy-backend.yml`).
- `trust proxy` ya configurado (PR #135) — prerequisito cumplido.

## Success Criteria

- [ ] Tras login, el token existe únicamente como cookie `httpOnly`; `document.cookie` no lo expone y `localStorage` no lo contiene.
- [ ] Un request con `Authorization: Bearer <token válido>` y sin cookie devuelve 401.
- [ ] `GET /auth/me` devuelve rol y permisos correctos; las vistas gateadas por rol se comportan igual que antes para admin y para `agente`.
- [ ] Un `POST/PUT/DELETE` sin header CSRF válido es rechazado; con header válido, pasa.
- [ ] `logout` invalida la sesión server-side y limpia la cookie; un request posterior devuelve 401.
- [ ] Cambio de contraseña sigue invalidando sesiones vía `token_version`, sin cambios.
- [ ] `npm test --prefix backend` en verde.
- [ ] Verificación en vivo contra `api.cotizador.lat` + `cotizador.lat` (no solo localhost): login, cotizar MRC end-to-end, panel admin, historial.

## Proposal question round

Preguntas abiertas para Kevin (no bloquean spec/design, sí pueden cambiar el diseño):

1. ¿`SameSite=Lax` o `Strict`? `Strict` es más seguro pero rompe la navegación entrante desde links externos hacia una vista autenticada. Supuesto: `Lax`.
2. ¿El token CSRF se emite en el login y dura toda la sesión, o se rota por request? Supuesto: uno por sesión, emitido junto a la cookie de auth.
3. ¿Se incluye `algorithms: ['HS256']` explícito en este mismo diff (ver "Decisión a confirmar")? Supuesto propuesto: sí.
4. ¿Hay clientes fuera del frontend web (scripts, Postman, integraciones) que hoy usen `Authorization: Bearer` y que el corte directo dejaría fuera? Supuesto: ninguno.
