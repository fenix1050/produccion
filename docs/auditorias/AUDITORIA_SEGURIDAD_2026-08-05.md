# Auditoría de seguridad — Cotizador Aseguradora Tajy

**Fecha:** 2026-08-05
**Alcance:** repositorio completo `fenix1050/produccion` (rama `main`, HEAD `be1f846`)
**Tipo:** revisión automatizada programada — OWASP Top 10 (2021), secretos expuestos, dependencias, prácticas de autenticación
**Resultado general:** ✅ Sin hallazgos críticos ni altos nuevos. Un hallazgo **Medio** heredado y sin cerrar (hash de contraseña real commiteado — ver §5.1) se documenta formalmente por primera vez en esta serie de auditorías y se abre como Issue de GitHub.

---

## 1. Resumen ejecutivo

Existen dos auditorías previas con el mismo alcance: `docs/auditorias/AUDITORIA_SEGURIDAD_2026-07-30.md` y `AUDITORIA_SEGURIDAD_2026-08-02.md`. Desde la última (HEAD `4e4598e` → `be1f846`, 27 commits), el proyecto cerró voluntariamente **3 de los 4 hallazgos heredados** que venían arrastrándose desde julio, en cambios ya reflejados en `CLAUDE.md`:

- El JWT ya no vive en `localStorage` — ahora es una cookie `httpOnly` (`tajy_session`) con protección CSRF de doble-submit (cambio `session-httponly-cookie`, PR #138). Cierra el hallazgo 🟠 Medio #1 de la auditoría 08-02.
- `JWT_SECRET` ahora falla rápido al arranque si falta (`backend/src/app.js`). Cierra el hallazgo 🟡 Bajo #2 de la auditoría 08-02.
- `app.set('trust proxy', 1)` agregado (evita que los rate limiters compartan un solo balde detrás de Caddy) y el login ahora compara contra un hash _dummy_ de tiempo constante cuando el usuario no existe (mitiga enumeración de cuentas por canal lateral de tiempo) — PR #135, cerrado el 2026-08-03.

Quedan sin cerrar, sin cambios respecto a la corrida anterior: la falta de cabeceras CSP en el frontend estático, y el Dockerfile del backend corriendo como root. A esto se suma el hallazgo Medio de esta corrida (§5.1), identificado en una auditoría externa el 2026-08-03 y registrado en `CLAUDE.md` pero nunca antes documentado en esta serie de reportes ni convertido en Issue de GitHub — se corrige esa omisión acá.

| Categoría                                 | Resultado                                                                                                                                                            |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secretos expuestos (repo + historial git) | 1 hallazgo Medio heredado (hash bcrypt de admin real, §5.1). Sin secretos nuevos.                                                                                    |
| Dependencias (`npm audit`)                | 0 vulnerabilidades (`--omit=dev` y completo). 9 paquetes con versión más nueva disponible, ninguno vulnerable (§3).                                                  |
| OWASP Top 10                              | Sin hallazgos Críticos/Altos. Controles de acceso, CSRF, XSS y logging de seguridad revisados en detalle (§4).                                                       |
| Prácticas de autenticación                | Sólidas: cookie httpOnly, JWT con `algorithms` explícito, revocación server-side vía `token_version`, mitigación de timing attack, rate limiting compuesto IP+email. |
| Hallazgos heredados sin cambios           | CSP ausente en frontend (Bajo), Dockerfile sin `USER` no-root (Bajo), errores Zod sin mapear a 400 (Bajo), `incrementarTokenVersion` no atómico (Bajo).              |

**Se crea 1 Issue de GitHub** por el hallazgo Medio de §5.1 (rotación de contraseña de administrador committeada en migración SQL) — ver §6.

---

## 2. Secretos expuestos

Barrido de patrones (`api_key`, `secret`, `password`, `token`, claves PEM, `AKIA...`) sobre todo el árbol trackeado, además de `git log --all --diff-filter=A -- '*.env*'` sobre el historial completo:

- **Ningún archivo `.env` real fue commiteado nunca.** Único resultado histórico: creación/edición de `backend/.env.example`, que solo tiene nombres de variable sin valores (`SUPABASE_SERVICE_KEY=`, `JWT_SECRET=`, etc.).
- `.gitignore` cubre `.env`/`.env.local` correctamente.
- Los workflows de CI/CD (`deploy-backend.yml`, `supabase-backup.yml`) usan `secrets.*` de GitHub exclusivamente; el backup de Supabase se sube como artifact privado, no como release pública.
- **Hallazgo Medio (heredado, no reportado formalmente hasta ahora):** `backend/migrations/028_auth_usuarios.sql:20` contiene un hash bcrypt real de la contraseña del usuario administrador inicial, committeado permanentemente en el historial de git. Detalle y severidad en §5.1.
- No se encontraron tokens tipo JWT (`eyJ...`), claves AWS (`AKIA...`) ni claves privadas PEM en ningún archivo de texto trackeado.

---

## 3. Dependencias desactualizadas / vulnerables

`npm audit` sobre el workspace completo (`backend` + raíz), con y sin `--omit=dev`: **0 vulnerabilidades** en las 4 categorías de severidad.

`npm outdated` sobre el mismo workspace — ningún resultado corresponde a una vulnerabilidad conocida, son versiones más nuevas disponibles:

| Paquete                  | Actual  | Última  | Nota                                                                                       |
| ------------------------ | ------- | ------- | ------------------------------------------------------------------------------------------ |
| `express`                | 4.22.2  | 5.2.1   | Salto de versión mayor (breaking changes), no urgente — sin CVE abierto en 4.x a la fecha. |
| `zod`                    | 3.25.76 | 4.4.3   | Salto de versión mayor, requiere revisar cambios de API antes de migrar.                   |
| `puppeteer`              | 24.43.1 | 25.5.0  | Sigue el ritmo de versiones de Chromium; sin CVE conocido en la serie 24.x usada.          |
| `eslint` / `@eslint/js`  | 9.39.5  | 10.x    | Tooling de desarrollo, no impacta runtime de producción.                                   |
| `express-rate-limit`     | 8.6.1   | 8.6.2   | Patch menor.                                                                               |
| `@supabase/supabase-js`  | 2.111.0 | 2.112.0 | Patch menor.                                                                               |
| `lint-staged`, `globals` | —       | —       | Tooling de desarrollo, patch/minor.                                                        |

**Acción sugerida:** ninguna urgente. Programar la migración a Express 5 y Zod 4 como tarea de mantenimiento (no de seguridad) cuando haya ventana, dado que son cambios de versión mayor con riesgo de romper comportamiento.

---

## 4. Revisión OWASP Top 10 (2021)

- **A01 Broken Access Control:** cada router monta `requireAuth` antes de exponer rutas; endpoints admin de alto riesgo (`PUT /admin/planes/:id/topes`, `DELETE /admin/ramos/:id`) usan `requireRole('admin')` literal en vez del permiso delegable `puede_editar_planes`, evitando que un rol con ese permiso suba su propio techo de descuento — decisión ya documentada y verificada. `verificarPropiedad()` en `cotizacion.service.js` bloquea con 403 a un agente no-admin que intente ver/editar/generar PDF de una cotización ajena (`agente_id !== usuario.id`). Sin hallazgos.
- **A02 Cryptographic Failures:** contraseñas con `bcryptjs` (`BCRYPT_ROUNDS` centralizado), JWT firmado con `HS256` explícito (`jwt.verify(..., { algorithms: ['HS256'] })` — cierra el vector de `alg: none`), cookie de sesión `httpOnly` + `Secure` en producción + `SameSite=lax`. Sin hallazgos nuevos; ver §5.1 para el hallazgo heredado de hash committeado.
- **A03 Injection:** no se encontró SQL parametrizado incorrectamente ni interpolación de input de usuario en filtros de Supabase. El único uso de `.or()` con interpolación de string (`coberturas.repository.js:129`, `plan_id.eq.${planId}`) recibe `plan.id`, un entero ya resuelto desde una fila de base de datos (no un valor crudo de request) — riesgo bajo, pero es un patrón frágil si se reutilizara con input directo de usuario; se recomienda validarlo como número antes de interpolar, por higiene. El generador CLI de migraciones de tasas de Incendio (`backend/scripts/generar-migracion-tasas-incendio.js` / `tasas-incendio.service.js`) construye SQL por concatenación de strings — contradice literalmente la regla "nunca concatenar SQL" de `docs/standards/SECURITY.md`, pero no es una ruta HTTP alcanzable por un atacante: es una herramienta de línea de comandos que un desarrollador de confianza corre manualmente sobre un archivo local. Severidad informativa, no se abre como hallazgo de esta auditoría.
- **A04 Insecure Design:** las 4 formas de pago se calculan siempre en servidor; el frontend nunca decide montos. `resolverDescuentos()` fuerza el descuento del plan del lado del servidor cuando el usuario no tiene el permiso de editarlo, sin confiar en el body del request.
- **A05 Security Misconfiguration:** `helmet()`, `cors({ origin: FRONTEND_URL, credentials: true })` (sin wildcard), `compression()`, rate limiting global y específico de login están todos montados. `trust proxy` fijado a `1` salto (correcto para la topología real detrás de Caddy). Hallazgo heredado: sin cabeceras CSP/`X-Frame-Options` en el frontend estático (`frontend/vercel.json` solo define `Cache-Control`) — ver §5.
- **A06 Vulnerable and Outdated Components:** ver §3, 0 vulnerabilidades conocidas.
- **A07 Identification and Authentication Failures:** login con comparación de tiempo constante (hash dummy) para no filtrar por timing qué emails existen, mensaje de error genérico, rate limiter compuesto IP+email (10 intentos/15 min), revocación de sesión server-side vía `token_version` (logout y cambio de contraseña invalidan todos los tokens vigentes), TTL de sesión corto (45 min). Sin hallazgos.
- **A08 Software and Data Integrity Failures:** CI corre lint + tests + CodeQL antes de cualquier deploy; `deploy-backend.yml` solo se dispara tras un `workflow_run` exitoso. Las acciones de terceros están pineadas por tag mayor (`@v1`, `@v7`) y no por SHA de commit — riesgo de cadena de suministro bajo pero real si un mantenedor de una de esas acciones fuera comprometido; patrón preexistente en todo el repo, ya señalado en la auditoría 08-02, severidad informativa.
- **A09 Security Logging and Monitoring Failures:** `logSeguridad()` registra login exitoso/fallido con motivo, y redacta explícitamente cualquier campo que contenga `token`/`password`/`password_hash` antes de loguear, aunque un caller pase esos campos por error. Sin hallazgos.
- **A10 SSRF:** no se encontraron llamadas salientes (`fetch`/`axios`/`http.request`) construidas a partir de una URL provista por el usuario en ningún endpoint backend. Sin superficie de SSRF identificada.

---

## 5. Hallazgos

### 5.1 🟠 Medio — Hash de contraseña del administrador real committeado permanentemente en una migración SQL

**Archivo:** `backend/migrations/028_auth_usuarios.sql:20`

Este archivo inserta el usuario administrador inicial del sistema con su `password_hash` bcrypt real embebido en el SQL versionado. El hash queda en el historial de git para siempre, incluso si el archivo se edita o la fila se actualiza en producción — cualquiera con acceso de lectura al repositorio (colaboradores, forks, una futura filtración de acceso) puede intentar crackearlo offline sin límite de tiempo ni rate limiting, algo que el `loginRateLimiter` del propio sistema no puede mitigar porque el ataque no pasa por el login.

Este hallazgo ya fue identificado en una auditoría de seguridad externa el 2026-08-03 (registrada en `CLAUDE.md`, sección "Auditoría de seguridad externa") con la recomendación explícita de "evaluar rotar esa contraseña específica", pero **nunca se documentó en esta serie de reportes (`docs/auditorias/`) ni se abrió como Issue de GitHub** — queda cerrado ese vacío de trazabilidad con esta auditoría.

**Impacto:** si la contraseña real detrás de ese hash es débil o fue reutilizada en otro sistema, un atacante con acceso al repo (o a un fork/clon) puede crackearla offline y usarla contra la cuenta de administrador real, o contra cualquier otro sistema donde Kevin haya reutilizado esa misma contraseña.

**Mitigación recomendada:** rotar la contraseña de esa cuenta de administrador específica en producción (vía el flujo de reseteo de contraseña ya existente en el panel admin, no editando el SQL histórico — el hash viejo seguirá en git de todos modos). El propio hash bcrypt no necesita eliminarse del historial (reescribir historial de git tiene su propio costo/riesgo); una vez rotada la contraseña real, el hash committeado queda inerte.

**Verdict:** confirmado, no exploitable de forma remota sin acceso previo al repositorio (que ya está restringido a colaboradores), por eso se clasifica Medio y no Alto — pero es una condición permanente que no se autocorrige con el tiempo.

### 5.2 🟡 Bajo (heredado, sin cambios desde 2026-07-30) — Sin cabeceras CSP en el frontend estático

`frontend/vercel.json` solo define `Cache-Control` para `.css`/`.js`/`.html`. No hay `Content-Security-Policy`, `X-Frame-Options` ni `X-Content-Type-Options`. El backend sí aplica `helmet()` con su CSP por defecto, pero esas cabeceras solo llegan a las respuestas JSON de la API — el HTML/JS servido desde Vercel (donde vive el riesgo real de XSS/clickjacking) no las recibe. El código de frontend ya escapa consistentemente el HTML dinámico (`escapeHtml()` en `shared/dom.js`, verificado en `historial.js`/`cotizar.js`/templates de PDF), lo que reduce el impacto práctico, pero una CSP serviría como capa de defensa adicional.

### 5.3 🟡 Bajo (heredado, sin cambios) — Dockerfile del backend corre como root

`backend/Dockerfile` no define un `USER` no-root; el proceso Node corre como root dentro del contenedor. Si Puppeteer/Chromium tuviera un exploit de escape de sandbox, el proceso comprometido ya tendría privilegios de root dentro del contenedor (aunque no en el host, dado el aislamiento de Docker).

### 5.4 🟡 Bajo (heredado, sin cambios) — Errores de validación Zod no mapeados a 400

Los controllers llaman `schema.parse(req.body)` y dejan que la `ZodError` se propague a `next(err)`. El manejador de errores central (`app.js`) usa `err.status || 500`, y `ZodError` no trae `.status` — el cliente recibe un 500 genérico ("Error interno del servidor") ante lo que en realidad es un 400 de validación. No es explotable, pero contradice la sección "Errores" de `docs/standards/SECURITY.md` en espíritu (aunque esa sección habla de no exponer detalles internos, no de status codes) y degrada la experiencia de debugging tanto para el frontend como para cualquier cliente de la API.

### 5.5 🟡 Bajo (heredado, sin cambios) — `incrementarTokenVersion` no es atómico

Confirmado sin cambios desde el roadmap de `CLAUDE.md`: el incremento de `token_version` (usado para revocar sesiones en logout/cambio de contraseña) se hace en una escritura separada, no dentro de la misma transacción que la operación que lo dispara. Ventana de inconsistencia teórica, baja probabilidad de explotación.

### ℹ️ Informativo — Acciones de GitHub sin pinear por SHA

Patrón preexistente en todo `.github/workflows/`: las acciones de terceros (`appleboy/ssh-action@v1`, `actions/checkout@v7`, etc.) están pineadas por tag mayor, no por SHA de commit. Riesgo de cadena de suministro bajo, ya señalado en la auditoría anterior.

### ℹ️ Informativo — Fase 4 (Propuesta Formal / KYC) sigue siendo un stub

`aceptarCotizacion()`/`generarPdfPropuestaFormal()` en `cotizacion.service.js` siguen lanzando `Error` genérico ("... pendiente — Fase 4"), sin lógica real que pueda explotarse. Las rutas que los exponen sí requieren `requireAuth`. No es un hallazgo de seguridad, es una nota de trazabilidad heredada de auditorías anteriores.

---

## 6. Issue de GitHub creado

Se abre un Issue nuevo por el hallazgo 🟠 Medio de §5.1 (hash de administrador committeado) — es el único hallazgo de esta corrida que no estaba ya cubierto por el Issue #87 abierto (revisión arquitectónica general) ni por ningún otro Issue existente, y representa una condición permanente que vale la pena trackear hasta que se rote la contraseña real.

**Issue:** [#149 — Seguridad (Medio): hash bcrypt del admin real committeado en migración 028_auth_usuarios.sql](https://github.com/fenix1050/produccion/issues/149)

---

## 7. Metodología

Auditoría automatizada ejecutada en una sola sesión, en modo incremental sobre la auditoría de 3 días antes (`AUDITORIA_SEGURIDAD_2026-08-02.md`, HEAD `4e4598e`):

- Diff de commits `4e4598e..be1f846` (27 commits) revisado con foco en auth (`session-httponly-cookie`), seguridad (`trust proxy` + timing constante) y CI/CD.
- `npm install` + `npm audit` (con y sin `--omit=dev`) sobre el workspace completo (Node 22 local; el proyecto pinea `engines.node >=24`, CI real corre en Node 24).
- `npm outdated` sobre el mismo workspace.
- Barrido de secretos por patrón (regex) sobre el árbol trackeado completo + `git log --all --diff-filter=A -- '*.env*'` sobre el historial completo del repo.
- Lectura directa de: middleware de auth/CSRF/rate-limit, `app.js`, `cookies.js`, `auth.service.js`, capa de repositorios en busca de interpolación de input de usuario en queries, templates de PDF (escaping), logger de seguridad, Dockerfile, `docker-compose.yml`, `vercel.json`, y `docs/standards/SECURITY.md` como checklist de referencia.
- Grep dirigido por patrones de secretos (`api_key`, `secret`, `password`, `token`, `eyJ`, `AKIA...`, bloques PEM) y por hashes bcrypt (`$2[aby]$`) en `backend/migrations/`.

No se ejecutaron pruebas dinámicas (DAST) ni pentesting activo contra ambientes desplegados — es una revisión estática de código fuente e infraestructura como código (workflows, Dockerfile, docker-compose).
