# Auditoría de seguridad — Cotizador Aseguradora Tajy

**Fecha:** 2026-07-30
**Alcance:** repositorio completo `fenix1050/produccion` (rama `main`, HEAD `5e60309`)
**Tipo:** revisión automatizada programada — OWASP Top 10 (2021), secretos expuestos, dependencias, prácticas de autenticación
**Resultado general:** ✅ Sin hallazgos críticos ni altos. 1 hallazgo medio, 4 bajos, resto informacional.

---

## 1. Resumen ejecutivo

| Categoría | Resultado |
|---|---|
| Secretos expuestos (repo + historial git) | Sin hallazgos. |
| Dependencias (`npm audit`) | 0 vulnerabilidades (critical/high/moderate/low) en 483 paquetes. |
| OWASP Top 10 — Broken Access Control (A01) | Sin hallazgos altos. 1 hallazgo bajo (código no implementado aún). |
| OWASP Top 10 — Cryptographic Failures (A02) | 1 hallazgo medio (token JWT en `localStorage`). |
| OWASP Top 10 — Injection (A03) | Sin hallazgos. |
| OWASP Top 10 — Security Misconfiguration (A05) | Sin hallazgos altos. 1 hallazgo bajo (sin CSP en frontend). |
| OWASP Top 10 — Authentication Failures (A07) | Sin hallazgos. |
| OWASP Top 10 — Logging & Monitoring (A09) | Sin hallazgos altos. Logging existe pero no es persistente/centralizado. |
| CSRF | No aplica (autenticación 100% Bearer JWT, sin cookies de sesión). |

No se creó Issue en GitHub porque no se encontró ningún hallazgo de severidad crítica o alta.

---

## 2. Secretos expuestos

**Sin hallazgos.** Revisión de código trackeado, `.gitignore`, e historial completo de git (`git log --all --full-history -- '*.env*'` y búsqueda de patrones `SUPABASE_SERVICE_ROLE`, `SECRET_KEY`, `PASSWORD`, JWTs, claves privadas, `postgres://`).

- `backend/src/config/supabase.js` y `backend/src/middleware/auth.js` cargan `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET` exclusivamente desde `process.env`, sin valores por defecto, y fallan al arrancar si faltan.
- Único archivo tipo `.env` trackeado es `backend/.env.example`, con placeholders (`https://xxxxxxxxxxxx.supabase.co`, claves vacías).
- `.gitignore` cubre correctamente `.env`/`.env.local`.
- Historial de git: la única modificación a un archivo `*.env*` en toda la historia es la creación de `backend/.env.example` — nunca se commiteó un secreto real.
- `.github/workflows/*.yml` no referencian secretos (solo lint/test/CodeQL). `render.yaml` declara `JWT_SECRET`/`SUPABASE_URL`/`SUPABASE_SERVICE_KEY` con `sync: false` (gestionados desde el dashboard de Render, no en el repo).
- Único texto tipo password encontrado son fixtures de test (`'password123'` en `usuarios.service.test.js`, secreto JWT falso en `auth.service.test.js`) — esperado y sin riesgo.

**Acción:** ninguna.

---

## 3. Dependencias desactualizadas / vulnerables

`npm audit` (workspace raíz, cubre `backend/` vía lockfile único) — **0 vulnerabilidades** en las 4 categorías de severidad, sobre 483 paquetes (304 prod / 178 dev / 3 opcionales). Igual resultado con `--omit=dev`.

Paquetes sensibles a seguridad, versión fijada vs. última disponible:

| Paquete | Fijado | Última | Nota |
|---|---|---|---|
| express | 4.22.2 | 5.2.1 | Un major atrás; 4.x sigue mantenido, sin CVE conocido en el rango usado |
| jsonwebtoken | 9.0.3 | 9.0.3 | Al día |
| bcryptjs | 3.0.3 | 3.0.3 | Al día |
| helmet | 8.3.0 | 8.3.0 | Al día |
| cors | 2.8.6 | 2.8.6 | Al día |
| multer | 2.2.0 | 2.2.0 | Al día (ya pasó las CVEs de DoS de versiones pre-2.x) |
| puppeteer | 24.43.1 | 25.4.0 | Un major atrás, sin vulnerabilidad señalada |
| dotenv | 17.4.2 | 17.4.2 | Al día |
| @supabase/supabase-js | 2.110.8 | 2.111.0 | Diferencia de patch, trivial |
| zod | 3.25.76 | 4.4.3 | Un major atrás; zod 4 es reescritura con breaking changes, fijado a propósito |

- `package-lock.json` commiteado en la raíz.
- `.github/dependabot.yml` configurado (actualizaciones semanales de npm agrupadas, con `ignore` explícito para los majors de express/zod/multer/puppeteer/eslint — política de revisión manual, consistente con la tabla de arriba). GitHub Actions también con Dependabot semanal.
- **Informacional:** no hay campo `engines` ni `.nvmrc`/`.node-version` — la versión de Node no está pinneada en el repo.

**Acción sugerida (no urgente):** ninguna obligatoria. Si se quiere cerrar la brecha informacional, considerar fijar `engines.node` y evaluar el salto a puppeteer 25 / express 5 en un cambio dedicado (no mezclar con trabajo de negocio, según convención del proyecto).

---

## 4. OWASP Top 10 — hallazgos detallados

### A01 — Broken Access Control
Sin hallazgos altos. `requireAuth` se aplica uniformemente a todos los sub-routers (`backend/src/routes/index.js:19-26`), con gates de rol/permiso adicionales en rutas de admin. La protección contra IDOR en cotizaciones está implementada explícitamente vía `verificarPropiedad()` (`backend/src/services/cotizacion.service.js:223-231`), usada en `obtenerCotizacion`, `generarPdfOferta` y `actualizarCotizacion`. El intento de escalar el propio rol a admin está bloqueado y logueado (`backend/src/services/admin/usuarios.service.js:49-77`).

- 🟡 **Bajo** — `backend/src/controllers/cotizaciones.controller.js:64-81`: `aceptar` y `pdfPropuesta` llaman a `aceptarCotizacion`/`generarPdfPropuestaFormal` **sin pasar `req.usuario`**, a diferencia del resto de endpoints de cotizaciones. Hoy no es explotable porque ambas funciones son stubs de Fase 4 que solo lanzan "Fase 4 pendiente" (`cotizacion.service.js:208-214`). **Queda como nota para quien implemente Fase 4 (Propuesta Formal):** agregar `verificarPropiedad(..., usuario)` ahí también, o cualquier agente autenticado podría aceptar/descargar la Propuesta Formal en PDF de una cotización ajena por ID.

### A02 — Cryptographic Failures
- Contraseñas hasheadas con bcrypt, factor de costo 12 (`backend/src/utils/security.js`). Correcto.
- JWT con expiración de 45 min y revocación server-side vía `token_version` (`auth.service.js:9-12`, verificado en `middleware/auth.js:35-37`). Buen diseño.
- 🟠 **Medio** — `frontend/shared/api.js:6-17`: el JWT y el perfil de usuario se guardan en `localStorage` (`tajy_token`/`tajy_usuario`), no en cookie `httpOnly`. Esto ya está identificado como pendiente en `CLAUDE.md` ("sesión httpOnly", Sprint 4 del roadmap pre-producción) — esta auditoría confirma que sigue así. Cualquier XSS futuro (incluso una regresión puntual) podría leer `localStorage` y exfiltrar el token. No hay CSP configurado en el frontend estático que mitigue el impacto.
- 🟡 **Bajo** — `backend/src/app.js:9-15` valida `FRONTEND_URL` al arrancar (falla duro si falta), pero no hay una validación equivalente para `JWT_SECRET`, y `backend/.env.example` ni siquiera lo lista. Un `JWT_SECRET` vacío/mal configurado en producción fallaría silenciosamente en `jwt.sign`/`jwt.verify` en vez de detectarse al iniciar — riesgo de disponibilidad/misconfiguración, no de bypass de auth.

### A03 — Injection
Sin hallazgos. Validación Zod aplicada consistentemente en el borde de la API (controllers) o al inicio de los services, antes de tocar repositorios. Todo el acceso a Supabase pasa por el query builder (`.eq/.ilike/.in/.rpc`), sin concatenación de SQL crudo. El frontend escapa datos de usuario vía helper compartido `escapeHtml()` (`frontend/shared/dom.js:3-15`) antes de cualquier interpolación en `innerHTML`, verificado en `historial.js`, `admin.js`, `cotizar.js`, `configuracion.js`, `login.js`, `bienvenida.js`, `sidebar.js`. Los templates PDF (`templates/oferta/mrc.js`, `incendio.js`) también escapan nombre/contacto de cliente y agente antes de incrustarlos en el HTML que renderiza Puppeteer.

### A05 — Security Misconfiguration
Sin hallazgos altos. `helmet()` aplicado (`backend/src/app.js:19-21`), CORS restringido a un único `FRONTEND_URL` explícito (sin wildcard, sin `credentials: true` — correcto dado que la auth es Bearer token y no cookie). El error handler central loguea `err.stack` solo server-side y devuelve mensajes curados o un genérico "Error interno del servidor" — no hay fuga de stack traces al cliente.

- 🟡 **Bajo** — No hay CSP/security headers configurados para el sitio estático de Netlify (no existe archivo `_headers`), lo que amplía levemente el radio de impacto si alguna vez aparece un XSS, dado que el token vive en `localStorage` (ver A02).

### A07 — Identification and Authentication Failures
Sin hallazgos. Login rate-limited (10 intentos / 15 min, por IP+email, usando `ipKeyGenerator` para evitar bypass por truncamiento de IPv6 — `backend/src/middleware/rate-limit.js:6-13`), más un rate limiter global de API (300/15min). Mensaje de error genérico ante login fallido ("Email o contraseña incorrectos") independientemente de si la cuenta existe, previniendo enumeración de usuarios. Logout y cambio de contraseña invalidan todos los tokens vigentes vía incremento de `token_version`.

- ℹ️ **Informacional:** la política de contraseña solo exige mínimo 8 caracteres, sin requisito de complejidad adicional — trade-off común, severidad baja.

### A09 — Security Logging and Monitoring Failures
`backend/src/utils/seguridad-logger.js` provee logging estructurado con redacción automática de campos sensibles (token/password), usado en login (éxito/fallo), alta/baja/edición de usuarios admin, cambios de rol, reseteo de contraseña por admin, y ya mencionados intentos de escalada de rol.

- ℹ️ **Informacional (ya documentado en el propio código):** el logging solo escribe a `console.warn`/`console.error`, sin almacenamiento persistente/centralizado — depende de lo que capture el host (Railway/Render). Coincide con el pendiente de "logging" del roadmap pre-producción en `CLAUDE.md`.

### CSRF
No aplica: no existe sesión basada en cookies; la autenticación es exclusivamente Bearer JWT en el header `Authorization` (`frontend/shared/api.js:45-48`), inmune a CSRF clásico por construcción.

---

## 5. Recomendaciones priorizadas

1. **(Medio)** Migrar el almacenamiento del JWT de `localStorage` a cookie `httpOnly` + `Secure` + `SameSite` — ya está trackeado como Sprint 4 del roadmap pre-producción en `CLAUDE.md`. Esta auditoría no encontró nada nuevo, solo confirma que sigue pendiente y por qué importa (mitiga robo de token ante un XSS futuro).
2. **(Bajo)** Cuando se implemente Fase 4 (Propuesta Formal / KYC), agregar la verificación de propiedad (`verificarPropiedad`) en `aceptarCotizacion` y `generarPdfPropuestaFormal`, igual que en el resto de endpoints de cotizaciones.
3. **(Bajo)** Agregar validación de arranque para `JWT_SECRET` (fail-fast si falta/vacío), igual que ya existe para `FRONTEND_URL`.
4. **(Bajo)** Agregar cabeceras CSP básicas al sitio estático de Netlify (`_headers` o `netlify.toml`).
5. **(Informacional)** Considerar centralizar el logging de seguridad (ya trackeado en el roadmap) y fijar `engines.node` en `package.json`.

Ninguno de estos puntos es bloqueante para producción por sí solo; los puntos 1 y 5 ya están reconocidos en el roadmap pre-producción existente (`docs/ESTADO_PROYECTO.md`, sección 30).

---

## 6. Metodología

Auditoría automatizada ejecutada por 3 revisiones paralelas de código (agentes de solo lectura, sin modificación de archivos):
- Búsqueda de secretos en árbol de trabajo e historial completo de git.
- `npm audit` sobre el workspace completo + revisión manual de versiones de paquetes sensibles a seguridad.
- Revisión de código dirigida a OWASP Top 10 (2021) y prácticas de autenticación/autorización, con lectura directa de middleware, controllers, services y repositories relevantes.

No se ejecutaron pruebas dinámicas (DAST) ni pentesting activo contra ambientes desplegados — es una revisión estática de código fuente.
