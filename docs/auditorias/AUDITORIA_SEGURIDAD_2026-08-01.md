# Auditoría de seguridad — Cotizador Aseguradora Tajy

**Fecha:** 2026-08-01
**Alcance:** repositorio completo `fenix1050/produccion` (rama `main`, HEAD `4e4598e`)
**Tipo:** revisión automatizada programada (recurrente) — OWASP Top 10 (2021), secretos expuestos, dependencias, prácticas de autenticación
**Auditoría anterior:** [`AUDITORIA_SEGURIDAD_2026-07-30.md`](./AUDITORIA_SEGURIDAD_2026-07-30.md), commit base `5e60309`. Esta corrida audita los **169 commits** que llegaron a `main` desde entonces (nuevas features de admin, un pipeline de deploy a VPS por CI/CD, y la corrección ya cerrada de una release pública con backup de Supabase) además de repetir en frío las 4 categorías completas.
**Resultado general:** ✅ Sin hallazgos críticos ni altos. 1 hallazgo bajo nuevo, resto igual o mejor que la auditoría anterior. **No se creó Issue en GitHub** — no hay ningún hallazgo de severidad crítica o alta.

---

## 1. Resumen ejecutivo

| Categoría                                      | Resultado                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| Secretos expuestos (repo + historial git)       | 1 hallazgo bajo nuevo (hash bcrypt de contraseña real en una migración versionada).     |
| Dependencias (`npm audit`)                      | 0 vulnerabilidades en 481 paquetes. Sin cambios respecto al 30/07 (483→481 es drift trivial de lockfile). |
| OWASP — Broken Access Control (A01)              | Sin hallazgos. Nuevos endpoints de admin (topes de plan, Ramos) correctamente gateados con `requireRole('admin')` literal, no permiso delegable — verificado en código, previene auto-escalada de privilegios. |
| OWASP — Cryptographic Failures (A02)             | Sin cambios. Sigue el hallazgo medio ya trackeado (JWT en `localStorage`).              |
| OWASP — Injection (A03)                          | Sin hallazgos explotables. 1 nota informacional (interpolación de filtro PostgREST con dato server-side, no de usuario). |
| OWASP — Insecure Design (A04)                    | Sin hallazgos. Validación Zod aplicada a los endpoints nuevos, incluyendo whitelist de campos que evita mass-assignment entre el endpoint de topes y el de edición general de plan. |
| OWASP — Security Misconfiguration (A05)          | 1 hallazgo bajo nuevo (contenedor backend sin `USER` no-root en Dockerfile).            |
| OWASP — Software/Data Integrity Failures (A08)   | Sin hallazgos. Pipeline nuevo de deploy a VPS revisado — sin inyección de comandos, sin trigger desde forks. |
| OWASP — Authentication Failures (A07)            | Sin hallazgos. Mecánica core (bcrypt-12, JWT 45min + revocación, rate limit, anti-enumeración) confirmada sin cambios. |
| OWASP — Logging & Monitoring (A09)                | Sin cambios respecto al 30/07.                                                          |
| Permiso nuevo `puede_ver_descuento_plan`         | Confirmado cosmético (solo frontend) — no se usa para gatear ninguna escritura server-side. |
| CSRF                                             | No aplica (Bearer JWT, sin cookies de sesión) — sin cambios.                            |
| Release pública con backup de Supabase (2026-07-31) | Ya remediada antes de esta auditoría (issue #66) — confirmado sin rastro residual: no hay releases con archivos de datos, solo tags de versión (`v0.1.7`–`v0.1.12`). |

---

## 2. Secretos expuestos

Revisión en frío: todo el árbol de trabajo actual, `git log --all -p` completo (no solo el rango desde la auditoría anterior), los 5 workflows de `.github/workflows/`, `backend/.env.example`, todas las migraciones SQL, frontend completo, `render.yaml` y `docker-compose.yml`.

### 🟡 Hallazgo nuevo — Bajo

**`backend/migrations/028_auth_usuarios.sql:20`** — La migración de seed del usuario `admin` inicial incluye el hash bcrypt (factor 12) de una contraseña real de Kevin, junto a su email real (`kevinruiz@tajy.com.py`). No es un secreto en texto plano y bcrypt-12 es resistente a cracking offline, pero es una credencial de producción real que queda de forma permanente en el historial de git de un repositorio cuya visibilidad no está confirmada como privada en este documento (ver auditoría 2026-07-30, sección "no confirmado que el repo sea privado" en `docs/insumos/`). No estaba señalado en la auditoría anterior.

**Acción sugerida:** rotar esa contraseña una vez (no hay forma de "sacarla" del historial sin reescribir git, que no se recomienda para un repo activo). Prioridad baja porque bcrypt-12 la protege adecuadamente incluso expuesta.

### Confirmado sin cambios / sin hallazgos

- Ningún archivo `.env` real fue commiteado nunca (solo `backend/.env.example` con placeholders).
- `.github/workflows/deploy-backend.yml` (nuevo desde la última auditoría): las 4 credenciales SSH (`VPS_HOST/SSH_USER/SSH_KEY/PORT`) se consumen vía `${{ secrets.* }}`, nunca se imprimen; el trigger es `workflow_run` de `CI` sobre `main`, no alcanzable desde PRs de forks.
- `.github/workflows/supabase-backup.yml` (nuevo): `SUPABASE_DB_URL` se pasa como variable de entorno a `pg_dump`, nunca se hace echo. El dump ahora se sube como **artifact privado** (`actions/upload-artifact`, requiere login + acceso de lectura al repo) en vez de release pública — esta es la corrección del hallazgo de la release `db-backup-2026-07-30-30567100851` (0 descargas, eliminada manualmente, issue #66). **Confirmado por API de GitHub:** el listado actual de releases del repo solo contiene tags de versión (`v0.1.7` a `v0.1.12`), ningún backup de datos.
- `render.yaml`: secretos declarados `sync: false` (gestionados desde el dashboard, no en el repo).
- `docker-compose.yml`: backend carga secretos vía `env_file: backend/.env` (gitignored), sin valores inline.
- Frontend: sin cliente Supabase embebido, sin API keys hardcodeadas; `frontend/shared/config.js` real está gitignored, solo se trackea `config.example.js`.

---

## 3. Dependencias desactualizadas / vulnerables

`npm audit --json` en la raíz (lockfile único, workspace npm — cubre `backend/` sin necesidad de auditoría separada): **0 vulnerabilidades** en las 4 categorías de severidad, sobre 481 paquetes (302 prod / 178 dev / 3 opcionales). Sin cambios respecto al 30/07 (483→481 es drift trivial del lockfile, sin señal de seguridad).

| Paquete                | Pinneado | Instalado (lockfile) | Última disponible | Estado                                                        |
| ----------------------- | -------- | --------------------- | ------------------ | --------------------------------------------------------------- |
| express                 | ^4.19.2  | 4.22.2                 | 5.2.1               | Un major atrás — deliberado, sin cambio                        |
| puppeteer                | ^24.15.0 | 24.43.1                | 25.4.0              | Un major atrás — deliberado, sin cambio                        |
| zod                      | ^3.23.8  | 3.25.76                | 4.4.3               | Un major atrás — deliberado, sin cambio                        |
| jsonwebtoken             | ^9.0.3   | 9.0.3                  | 9.0.3               | Al día                                                           |
| bcryptjs                 | ^3.0.3   | 3.0.3                  | 3.0.3               | Al día                                                           |
| helmet                   | ^8.3.0   | 8.3.0                  | 8.3.0               | Al día                                                           |
| cors                     | ^2.8.5   | 2.8.6                  | 2.8.6               | Al día                                                           |
| multer                   | ^2.2.0   | 2.2.0                  | 2.2.0               | Al día                                                           |
| dotenv                   | ^17.4.2  | 17.4.2                 | 17.4.2              | Al día                                                           |
| @supabase/supabase-js    | ^2.110.8 | 2.110.8                | 2.111.0             | Patch nuevo disponible (menor, no breaking) — único cambio desde el 30/07 |
| exceljs                  | ^4.4.0   | 4.4.0                  | 4.4.0               | Al día                                                           |
| express-rate-limit       | ^8.6.1   | 8.6.1                  | 8.6.1               | Al día                                                           |

`.github/dependabot.yml`: actualizaciones semanales npm (agrupadas) e independientes para GitHub Actions, con `ignore` explícito de majors para `eslint*`/`express`/`zod`/`multer`/`puppeteer` — consistente con las decisiones deliberadas de arriba.

**Informacional (sin cambio):** sigue sin existir `.nvmrc`/`engines.node` — versión de Node no pinneada en el repo.

**Acción sugerida:** ninguna urgente. Bump opcional de `@supabase/supabase-js` a `2.111.0` (patch trivial) cuando convenga.

---

## 4. OWASP Top 10 — hallazgos detallados (delta desde 5e60309)

### A01 — Broken Access Control

Sin hallazgos. Los endpoints nuevos de admin desde la auditoría anterior — `PUT /admin/planes/:id/topes` (editar `descuento_maximo`/`recargo_maximo`) y `GET/PUT/DELETE /admin/ramos*` — usan `requireRole('admin')` literal en `backend/src/routes/admin.routes.js:70,75-77`, **no** el permiso delegable `puede_editar_planes` que ya tienen Jefe/Analista de Riesgo. Esto es intencional (documentado en `CLAUDE.md`) para que esos roles no puedan subir el tope que a ellos mismos los limita — confirmado en código, no solo en documentación. A nivel de schema, `editarPlanTopesSchema` solo acepta `descuento_maximo`/`recargo_maximo` y `editarPlanSchema` (el del endpoint con permiso delegable) no incluye esos campos, así que aunque ambos caminos terminan en el mismo `planesService.editarPlan()`, no hay forma de colar un cambio de tope por la ruta con permiso más débil.

### A02 — Cryptographic Failures

Sin cambios desde el 30/07. Sigue pendiente (Sprint 4 del roadmap, ya trackeado en `CLAUDE.md`, no es un hallazgo nuevo):

- 🟠 **Medio** — JWT y perfil de usuario en `localStorage` (`frontend/shared/api.js`), no en cookie `httpOnly`. Mitigación pendiente conocida.
- 🟡 **Bajo** — Sin validación de arranque de `JWT_SECRET` (`backend/src/middleware/auth.js:22`, `auth.service.js:48` lo leen directo de `process.env` sin guard).

### A03 — Injection

Sin hallazgos explotables. Todo el código nuevo de repositorio (`ramos.repository.js`, `tasas.repository.js`) usa el query builder parametrizado de Supabase.

- ℹ️ **Informacional** — `backend/src/repositories/coberturas.repository.js:129` construye un filtro PostgREST por template literal (`.or(\`plan_id.is.null,plan_id.eq.${planId}\`)`). `planId` viene siempre de una fila ya leída server-side (`cotizacion.service.js:376`), nunca directo de request del usuario, así que no es explotable hoy — pero es un patrón fragil si algún cambio futuro empieza a pasarle un valor de entrada sin validar. Sugerido parametrizar en vez de interpolar, sin urgencia.

### A04 — Insecure Design

Sin hallazgos. Zod aplicado en el borde para los schemas nuevos (`editarPlanTopesSchema`, `editarRamoSchema`), con el stripping de claves desconocidas de Zod evitando mass-assignment entre el endpoint de topes y el de edición general de plan (ver A01). `rubrosActividadQuerySchema` ahora exige `ramo_id` (fail-closed, reemplaza un default permisivo anterior que podía filtrar filas entre ramos).

### A05 — Security Misconfiguration

- 🟡 **Bajo, nuevo** — `backend/Dockerfile` no tiene directiva `USER`; el contenedor del backend (incluyendo Puppeteer/Chromium, que renderiza HTML a PDF) corre como root. Severidad baja por el aislamiento del contenedor, pero es una buena práctica pendiente — considerar `USER node` en un cambio dedicado.
- 🟡 **Bajo, sin cambios** — Sitio estático de Netlify/Vercel sigue sin cabeceras CSP.

### A07 — Authentication Failures

Sin hallazgos, mecánica core confirmada sin cambios: bcrypt factor 12, JWT 45min con revocación server-side vía `token_version`, rate limit de login (10/15min por IP+email con `ipKeyGenerator`), mensaje de error genérico anti-enumeración, logout/cambio de contraseña invalidan todos los tokens vigentes.

- ℹ️ **Informacional, sin cambios:** política de contraseña solo exige 8 caracteres mínimo, sin complejidad adicional.

### A08 — Software and Data Integrity Failures

Sin hallazgos. Pipeline nuevo `.github/workflows/deploy-backend.yml` (deploy a VPS por SSH): dispara solo con `workflow_run` de `CI` exitoso sobre `main` (código no revisado/mergeado no puede disparar deploy). El script SSH es un heredoc estático, sin interpolación de datos de PR o de ningún input no confiable — sin superficie de inyección de comandos. `git reset --hard origin/main && git clean -fd` es destructivo pero está acotado a un checkout de deploy desechable y documentado como tal en el propio workflow (confirmado con Kevin, sin trabajo propio de valor ahí). El health check solo imprime la respuesta pública de `/health`, sin fuga de información.

### A09 — Security Logging and Monitoring Failures

Sin cambios desde el 30/07 (logging estructurado con redacción de campos sensibles, pero sin almacenamiento persistente/centralizado — ya trackeado en el roadmap).

### CSRF

No aplica, sin cambios (Bearer JWT exclusivo, sin cookies de sesión).

### XSS (verificación del refactor responsive y nuevas columnas de admin)

Sin hallazgos. El nuevo código de admin (edición inline de `nombre_display` en Ramos, nuevas columnas de Roles/Planes) y el nuevo markup de sidebar/topbar del refactor responsive (`frontend/shared/sidebar.js:82-85`) enrutan correctamente por el helper `escapeHtml()` (`frontend/shared/dom.js`) antes de cualquier interpolación en `innerHTML`. Los inputs numéricos nuevos de topes (`descuento_maximo`/`recargo_maximo`) se renderizan como números crudos, sin superficie de inyección de string.

### Verificación del permiso nuevo `puede_ver_descuento_plan`

Confirmado como puramente cosmético, tal como documenta `CLAUDE.md`: se lee y se propaga hasta `req.usuario` (repositorios de usuarios/roles, `admin.schema.js`), pero `resolverDescuentos()` (`cotizacion.service.js:474-485`) — el único lugar que fuerza el descuento fijo del plan server-side — solo lee `puede_editar_descuento_plan`. Ocultar o mostrar el campo en el frontend no puede usarse para eludir el cálculo de descuento.

---

## 5. Recomendaciones priorizadas

1. **(Bajo, nuevo)** Rotar la contraseña real de Kevin cuyo hash bcrypt quedó en `backend/migrations/028_auth_usuarios.sql` — protegida por bcrypt-12 pero es una credencial de producción real en el historial de git.
2. **(Bajo, nuevo)** Agregar `USER node` (o equivalente no-root) al `Dockerfile` del backend.
3. **(Medio, ya trackeado)** Migrar el JWT de `localStorage` a cookie `httpOnly` + `Secure` + `SameSite` — Sprint 4 del roadmap pre-producción, sin novedad esta auditoría.
4. **(Bajo, ya trackeado)** Validación de arranque para `JWT_SECRET` (fail-fast si falta/vacío).
5. **(Bajo, ya trackeado)** Cabeceras CSP para el sitio estático.
6. **(Informacional)** Parametrizar el filtro PostgREST interpolado en `coberturas.repository.js:129` en vez de usar template literal, como defensa en profundidad (no explotable hoy).
7. **(Informacional, ya trackeado)** Fijar `engines.node`/`.nvmrc`; centralizar logging de seguridad.

Ninguno de estos puntos es bloqueante para producción. Nada de severidad crítica o alta fue encontrado — **no se abrió Issue en GitHub**, siguiendo el mismo criterio que la auditoría del 30/07.

---

## 6. Metodología

Auditoría automatizada ejecutada por 4 revisiones paralelas de solo lectura (sin modificación de archivos):

- Búsqueda de secretos en árbol de trabajo completo e historial íntegro de git (`git log --all -p`), workflows de CI/CD, migraciones, frontend y archivos de deploy — más verificación cruzada vía API de GitHub del estado actual de releases (confirmando remediación del hallazgo de backup público del 31/07).
- `npm audit` sobre el workspace completo + comparación de versión instalada vs. última disponible para paquetes sensibles a seguridad.
- Revisión de código dirigida a OWASP Top 10 (2021), con foco específico en los 169 commits nuevos desde la auditoría anterior (nuevos endpoints de admin, permiso `puede_ver_descuento_plan`, pipeline de deploy a VPS).
- Revisión de prácticas de autenticación/autorización: confirmación de que la mecánica core no tuvo regresiones, más verificación profunda de que el permiso nuevo y los endpoints de admin nuevos respetan el patrón de auto-escalada de privilegios ya establecido en el proyecto.

No se ejecutaron pruebas dinámicas (DAST) ni pentesting activo contra ambientes desplegados — es una revisión estática de código fuente, igual que la auditoría anterior.
