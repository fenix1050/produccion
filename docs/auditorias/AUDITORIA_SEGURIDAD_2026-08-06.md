# Auditoría de seguridad — Cotizador Aseguradora Tajy

**Fecha:** 2026-08-06
**Alcance:** repositorio completo `fenix1050/produccion` (rama `main`, HEAD `5d50bba`)
**Tipo:** revisión automatizada programada — OWASP Top 10 (2021), secretos expuestos, dependencias, prácticas de autenticación
**Resultado general:** ✅ Sin hallazgos críticos ni altos. Sin hallazgos nuevos desde la auditoría anterior (`AUDITORIA_SEGURIDAD_2026-08-02.md`, HEAD `4e4598e`).

---

## 1. Resumen ejecutivo

Cuarta auditoría de esta serie (previas: 2026-07-30, 2026-08-02). Desde la última corrida hubo 62 commits, incluyendo un cambio de seguridad grande ya cerrado (`session-httponly-cookie`, migró el JWT de `localStorage` a cookie `httpOnly` + CSRF double-submit) y feature nuevo (`rpf-variable-mrc`, curva de R.P.F. por cuotas con endpoints admin nuevos). Esta corrida:

1. Repitió `npm audit` y el barrido de secretos sobre el estado actual.
2. Verificó que los hallazgos abiertos de la auditoría del 08-02 sigan igual (dos de ellos ya se habían cerrado en el camino, confirmado acá).
3. Revisó en detalle los endpoints/tablas nuevos desde el 08-02: cookies de sesión, middleware CSRF, `auth.service.js` (timing-safe login), y el nuevo endpoint admin de R.P.F. por cuotas.
4. Barrido de XSS (`innerHTML`) en los archivos de frontend tocados desde el 08-02.

| Categoría                                           | Resultado                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Secretos expuestos (repo + historial git)           | Sin hallazgos.                                                                                                                                                                                                                                                                                                           |
| Dependencias (`npm audit`, root y `backend/`)       | 0 vulnerabilidades en las 4 categorías de severidad. `npm outdated`/`npm-check-updates`: solo minor/patch y 3 majors con breaking changes conocidos (express 5, puppeteer 25, zod 4), ya excluidos a propósito del auto-bump de Dependabot.                                                                              |
| Sesión / autenticación                              | Cookie `tajy_session` httpOnly + `secure` en producción + `sameSite=lax` + dominio acotado; CSRF double-submit con comparación _timing-safe_; JWT `HS256` explícito; revocación server-side vía `token_version`; login con mitigación de canal lateral de tiempo (bcrypt contra hash dummy). Sin hallazgos.              |
| Endpoint admin nuevo (`GET/PUT /admin/rpf-cuotas`)  | Gateado con `requirePlanesEdit` (mismo permiso que ya editaba el escalar de R.P.F.), payload validado con Zod (`forma_pago_id` entero positivo, `cuotas` 1-24, `tasa_rpf` ≥ 0, máx. 100 celdas), tabla `rpf_cuotas` con RLS habilitado sin policies (default-deny, mismo patrón que el resto del schema). Sin hallazgos. |
| XSS (`innerHTML`) en frontend tocado desde el 08-02 | Todo valor interpolado pasa por `escapeHtml()` (`frontend/shared/dom.js`), incluida la grilla nueva de R.P.F. por cuotas. Sin hallazgos.                                                                                                                                                                                 |
| CI/CD                                               | Sin cambios de fondo desde el 08-02 (mismo `deploy-backend.yml`/`supabase-backup.yml`, ya revisados). `Dependabot` sigue activo semanalmente para `npm` y `github-actions`.                                                                                                                                              |

No se creó Issue en GitHub porque no se encontró ningún hallazgo nuevo de severidad crítica o alta.

---

## 2. Secretos expuestos

**Sin hallazgos.**

- Grep de patrones (`SUPABASE_SERVICE_KEY`, `JWT_SECRET`, claves privadas PEM, AWS access keys, `password=`/`api_key=` literales, tokens tipo `sk-...`) sobre todo el árbol trackeado: únicos matches son referencias a `process.env.*` y comentarios explicativos (`backend/src/config/supabase.js`, `backend/src/app.js`, varias migraciones SQL). Ningún valor real.
- `git log --all --full-history --diff-filter=A -- '*.env*'`: único resultado es `backend/.env.example` (placeholders) más el mensaje de un commit de test que menciona ".env" al pasar (no agrega ni modifica ningún `.env` real).
- `.gitignore` sigue cubriendo `.env`/`.env.local`.
- `render.yaml` declara `JWT_SECRET`/`SUPABASE_SERVICE_KEY`/`SUPABASE_URL` con `sync: false` (sin valor en el repo, se completan en el dashboard de Render) — correcto.
- Sin cambios en el manejo de secretos de los workflows de CI/CD desde el 08-02.

**Acción:** ninguna.

---

## 3. Dependencias

`npm audit` sobre el root del monorepo y sobre `backend/` (con y sin `--omit=dev`): **0 vulnerabilidades** en las 4 categorías de severidad, 485 dependencias resueltas en `backend/`.

`npm-check-updates`:

- Root: solo `globals`/`lint-staged` (minor) y `eslint`/`@eslint/js` (major, tooling de dev, sin superficie de runtime).
- `backend/`: `cors`/`express-rate-limit` (patch), `@supabase/supabase-js` (minor), y 3 majors con breaking changes conocidos — `express` 4→5, `puppeteer` 24→25, `zod` 3→4 — los tres ya están en la lista de exclusión explícita de `.github/dependabot.yml` para no auto-mergearse sin revisión manual. No representan una vulnerabilidad, son actualizaciones que requieren migración de código.

**Acción:** ninguna. Los 3 majors pendientes son candidatos a una migración planificada (fuera del alcance de esta auditoría), no un hallazgo de seguridad.

---

## 4. Autenticación y manejo de sesión

Revisión completa de `backend/src/middleware/auth.js`, `backend/src/middleware/csrf.js`, `backend/src/middleware/rate-limit.js`, `backend/src/services/auth.service.js` y `backend/src/utils/cookies.js` (todos tocados o creados por el cambio `session-httponly-cookie`, cerrado el 2026-08-03, no auditado en detalle desde entonces):

- **Cookie de sesión** (`tajy_session`): `httpOnly` (inaccesible desde JS), `secure` condicionado a `NODE_ENV=production`, `sameSite=lax`, `domain=.cotizador.lat` solo en producción, `maxAge` de 45 min alineado al TTL del JWT. `set`/`clear` comparten la misma función de opciones (evita cookies zombis por mismatch de atributos).
- **CSRF double-submit** (`tajy_csrf`, no-httpOnly + header `X-CSRF-Token`): comparación con `timingSafeEqual` (no `===`), aplicado a todo método mutante salvo `/auth/login` (justificado: no existe cookie CSRF antes de loguearse, cubierto por `loginRateLimiter`). Montado globalmente antes del router, no ruta por ruta — sin riesgo de un endpoint nuevo que se olvide de aplicarlo.
- **JWT**: `algorithms: ['HS256']` explícito en `jwt.verify()` (cierra el vector de confusión de algoritmo / `alg:none`). `JWT_SECRET` validado fail-fast al arranque en `app.js`. Revocación server-side real vía `usuario.token_version` comparado contra el valor fresco de la DB en cada request (no solo contra el payload del token) — logout, cambio de contraseña o reseteo por admin invalidan sesiones viejas aunque el JWT no haya expirado.
- **Login**: mensaje de error genérico e idéntico para email inexistente / password incorrecta / usuario inactivo. Mitigación de canal lateral de tiempo confirmada en código: `bcrypt.compare()` corre siempre, incluso cuando el usuario no existe, contra un hash dummy de costo constante (`HASH_DUMMY_TIMING`) — sin esto, la ausencia de esa llamada delataría por tiempo de respuesta qué emails existen.
- **Rate limiting de login**: `loginRateLimiter` combina IP + email (10 intentos/15 min), usa `ipKeyGenerator` (normaliza IPv6, evita bypass por truncamiento/expansión de la dirección).
- **`trust proxy`**: seteado a `1` (un solo salto, Caddy) — correcto para que `req.ip` en los rate limiters refleje la IP real del cliente y no la del proxy interno.

Sin hallazgos.

---

## 5. Endpoint y tabla nuevos: R.P.F. por cuotas

Cambio `rpf-variable-mrc` (PR1-3, `#161`/`#162`/`#163`), cerrado el 2026-08-05, no revisado en la auditoría anterior:

- `GET/PUT /api/admin/rpf-cuotas` gateados con `requirePlanesEdit` — mismo permiso que ya controlaba la edición del escalar de R.P.F. legacy, sin ampliar la superficie de quién puede tocar tarifas.
- `PUT` valida el payload con Zod (`editarCurvaRpfSchema`): array de 1 a 100 celdas, `forma_pago_id` entero positivo, `cuotas` entero 1-24, `tasa_rpf` numérico ≥ 0. Sin campos libres ni coerción insegura de tipos.
- Tabla `rpf_cuotas` (migración `058_rpf_por_cuotas.sql`) tiene `ENABLE ROW LEVEL SECURITY` sin policies — mismo patrón default-deny que el resto del schema desde la migración `046`; el backend accede vía `SUPABASE_SERVICE_KEY` (bypasea RLS) y no hay cliente Supabase en el frontend, así que el default-deny solo afecta a roles `anon`/`authenticated` que de todos modos no la consultan directamente.
- Frontend (`frontend/admin/render/rpf-cuotas.js`): las 33 celdas de la grilla, nombres de forma de pago y mensajes de error interpolados pasan todos por `escapeHtml()` antes de ir a `innerHTML` — mismo patrón defensivo que el resto del admin.

Sin hallazgos.

---

## 6. Barrido de XSS en frontend tocado desde la auditoría anterior

Se revisaron los usos de `innerHTML` en los 18 archivos de frontend modificados desde el 2026-08-02 (`admin/`, `bienvenida/`, `configuracion/`, `cotizar/`, `historial/`, `login/`, `shared/api.js`, `shared/logger.js`). Todos los puntos de interpolación de datos dinámicos (nombres de usuario, mensajes de error del servidor, valores de formularios) usan `escapeHtml()` de `frontend/shared/dom.js` antes de insertarse en el template literal. No se encontró ninguna concatenación directa de datos no confiables sin escapar.

Sin hallazgos.

---

## 7. Otras verificaciones (sin cambios desde auditorías previas, re-confirmadas)

- Sin `eval()`, `new Function()`, ni `child_process`/`exec*` en `backend/src` — sin superficie de inyección de comandos.
- Import de planillas Excel (`multer` en `admin-tasas.routes.js`): límite de tamaño de 10 MB + filtro de extensión/mimetype `.xlsx`, ya cerrado en el hallazgo E1/C3 de `issue #87` (2026-08-03).
- Helmet montado con headers por defecto (`app.use(helmet())`) en el backend (API JSON). CORS con `origin` explícito (nunca wildcard) + `credentials: true`.
- `Dependabot` sigue activo (`npm` semanal lunes, `github-actions` semanal martes), con majors riesgosos excluidos del auto-bump.

---

## 8. Hallazgos abiertos (heredados, estado actualizado)

| #   | Severidad        | Hallazgo original                                                                                                      | Estado a 2026-08-06                                                                                                                                                                                                                    |
| --- | ---------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 🟠 Medio         | JWT y perfil de usuario en `localStorage`, no en cookie `httpOnly`                                                     | ✅ **Cerrado.** Migrado a cookie `httpOnly` + CSRF (`session-httponly-cookie`, PR #138, 2026-08-03). Confirmado en esta corrida (sección 4).                                                                                           |
| 2   | 🟡 Bajo          | Sin validación de arranque fail-fast para `JWT_SECRET`                                                                 | ✅ **Cerrado.** `app.js` valida `JWT_SECRET` al arranque (issue #87, PR #131, 2026-08-03). Confirmado en esta corrida.                                                                                                                 |
| 3   | 🟡 Bajo          | Sin cabeceras CSP en el frontend estático (Vercel)                                                                     | 🟡 **Sigue abierto.** `frontend/vercel.json` solo define `Cache-Control` para `.css`/`.js`/`.html` — sin `Content-Security-Policy`, `X-Frame-Options` ni headers de seguridad equivalentes. Confirmado sin cambios en esta corrida.    |
| 4   | 🟡 Bajo          | Nota de Fase 4 (Propuesta Formal/KYC): `aceptar`/`pdfPropuesta` en `cotizaciones.controller.js` no pasan `req.usuario` | 🟡 **Sigue abierto, no explotable.** Confirmado: `aceptarCotizacion`/`generarPdfPropuestaFormal` en `cotizacion.service.js` siguen siendo stubs que tiran `Error('... pendiente — Fase 4')` — no hay lógica real que ejecutar todavía. |
| 5   | ℹ️ Informacional | GitHub Actions de terceros pineadas por tag mayor (`@v1`, `@v7`), no por SHA de commit                                 | ℹ️ **Sigue igual**, patrón preexistente en todo el repo, severidad baja, riesgo de cadena de suministro si un mantenedor de action fuera comprometido.                                                                                 |

**Recomendación no bloqueante:** los ítems 3 y 5 son de bajo costo y podrían agruparse en una sesión corta (agregar headers de seguridad al `vercel.json` del frontend; evaluar pinning por SHA de las Actions más sensibles como `appleboy/ssh-action`). Ninguno es condición dura para producción según el roadmap vigente en `CLAUDE.md`.

---

## 9. Metodología

Auditoría automatizada, incremental sobre la corrida del 2026-08-02:

- Diff de commits `4e4598e..5d50bba` (62 commits) revisado con foco en cambios de seguridad, auth y endpoints/tablas nuevos.
- `npm audit` (root y `backend/`, con y sin `--omit=dev`) + `npm outdated`/`npx npm-check-updates` sobre ambos `package.json`.
- Barrido de secretos por patrón (regex) sobre el árbol trackeado completo + historial de archivos `.env*`.
- Lectura directa de middleware de auth/CSRF/rate-limit, `auth.service.js`, `utils/cookies.js`, el endpoint y la migración nuevos de R.P.F. por cuotas, y `render.yaml`.
- Barrido de `innerHTML` en los 18 archivos de frontend modificados desde la auditoría anterior, confirmando uso de `escapeHtml()`.
- Grep de `eval`/`new Function`/`child_process`/`exec*` sobre `backend/src`.

No se ejecutaron pruebas dinámicas (DAST) ni pentesting activo contra ambientes desplegados — es una revisión estática de código fuente e infraestructura como código (workflows, migraciones).
