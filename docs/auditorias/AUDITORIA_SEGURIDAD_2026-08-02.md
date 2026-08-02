# Auditoría de seguridad — Cotizador Aseguradora Tajy

**Fecha:** 2026-08-02
**Alcance:** repositorio completo `fenix1050/produccion` (rama `main`, HEAD `4e4598e`)
**Tipo:** revisión automatizada programada — OWASP Top 10 (2021), secretos expuestos, dependencias, prácticas de autenticación
**Resultado general:** ✅ Sin hallazgos críticos ni altos. Sin hallazgos nuevos desde la auditoría anterior.

---

## 1. Resumen ejecutivo

Existe una auditoría completa de 3 días antes (`docs/auditorias/AUDITORIA_SEGURIDAD_2026-07-30.md`, HEAD `5e60309`) con el mismo alcance y sin hallazgos críticos/altos. En vez de repetir la revisión completa desde cero, esta corrida se enfocó en:

1. Verificar que los 4 hallazgos abiertos de esa auditoría (medio/bajo) siguen igual, sin regresión.
2. Revisar en detalle todo lo que cambió entre `5e60309` y `HEAD` (42 archivos, incluye 3 workflows de CI/CD nuevos y varios endpoints de admin nuevos).
3. Repetir `npm audit` y el barrido de secretos sobre el estado actual.

| Categoría                                 | Resultado                                                      |
| ------------------------------------------ | --------------------------------------------------------------- |
| Secretos expuestos (repo + historial git) | Sin hallazgos.                                                  |
| Dependencias (`npm audit`)                | 0 vulnerabilidades (`--omit=dev` y completo).                   |
| CI/CD nuevo (`deploy-backend.yml`, `supabase-backup.yml`) | Sin hallazgos. Secretos vía GitHub Secrets, backup no público. |
| Endpoints admin nuevos (topes de plan, eliminar ramo, permiso ver descuento) | Sin hallazgos. Gates de rol correctos, validación Zod, enforcement server-side. |
| Hallazgos abiertos de la auditoría anterior | Sin cambios (medio: JWT en localStorage; bajos: sin fail-fast de `JWT_SECRET`, sin CSP, nota de Fase 4 sin implementar). |

No se creó Issue en GitHub porque no se encontró ningún hallazgo nuevo de severidad crítica o alta.

---

## 2. Secretos expuestos

**Sin hallazgos.** Repetido el barrido sobre el estado actual:

- Grep de patrones (`SUPABASE_SERVICE`, `JWT_SECRET`, claves privadas PEM, AWS keys, `password=`/`api_key=` literales) sobre todo el árbol trackeado: únicos matches son referencias a `process.env.SUPABASE_SERVICE_KEY`/comentarios explicativos en `backend/src/config/supabase.js` y `backend/migrations/046_enable_rls_public_tables.sql` — no hay ningún valor real.
- `git log --all --full-history --diff-filter=A -- '*.env*'`: la única historia de archivos `.env*` sigue siendo la creación/edición de `backend/.env.example` (placeholders). Ningún `.env` real fue commiteado nunca.
- `.gitignore` sigue cubriendo `.env`/`.env.local` correctamente.
- `.mcp.json` y `.codex/config.toml` (nuevos desde la última auditoría) solo declaran la URL del servidor MCP de Supabase (`https://mcp.supabase.com/mcp?project_ref=...`) — el `project_ref` no es un secreto, es un identificador público de proyecto; la autenticación real ocurre vía OAuth interactivo, no hay token en el archivo.
- Los 2 workflows de CI/CD nuevos desde la auditoría anterior manejan secretos correctamente:
  - `.github/workflows/deploy-backend.yml`: `VPS_HOST`/`VPS_SSH_USER`/`VPS_SSH_KEY`/`VPS_SSH_PORT` vía `secrets.*` de GitHub, nunca en texto plano.
  - `.github/workflows/supabase-backup.yml`: `DATABASE_URL` vía `secrets.SUPABASE_DB_URL`, el dump se sube como *artifact* privado de Actions (`actions/upload-artifact`, requiere login + acceso de lectura al repo), no como release pública — este workflow ya había tenido y corregido ese problema exacto (commit `2a83a28`, "dejar de publicar el backup de Supabase como release pública"), confirmado que sigue corregido.

**Acción:** ninguna.

---

## 3. Dependencias desactualizadas / vulnerables

`npm audit` sobre el workspace actual, con y sin `--omit=dev`: **0 vulnerabilidades** en las 4 categorías de severidad.

Único cambio de dependencias desde la auditoría anterior: se **removieron** `@vercel/analytics` y `@vercel/speed-insights` del `package.json` raíz (commit `135c948`) — reduce superficie, no la aumenta. No se agregó ninguna dependencia nueva desde el 30/07.

La tabla de paquetes sensibles a seguridad de la auditoría anterior (express 4.x, jsonwebtoken, bcryptjs, helmet, cors, multer, puppeteer, dotenv, @supabase/supabase-js, zod) sigue vigente sin cambios de versión relevantes.

**Acción:** ninguna.

---

## 4. Revisión de cambios desde la auditoría anterior (2026-07-30 → 2026-08-02)

### 4.1 CI/CD — deploy automático del backend a la VPS (nuevo)

`deploy-backend.yml` se dispara solo tras `workflow_run` exitoso de CI en `main` (nunca despliega código que no pasó lint/tests), se conecta por SSH con `appleboy/ssh-action@v1` usando credenciales de `secrets.*`, y hace `git reset --hard origin/main && git clean -fd` seguido de `docker compose up --build -d backend`. Incluye health check post-deploy contra `/health` con reintentos.

- ℹ️ **Informacional:** la acción de terceros está pineada por tag mayor (`@v1`), no por SHA de commit — riesgo de cadena de suministro si el mantenedor del action fuera comprometido y republicara el tag. Mismo patrón de riesgo que `actions/checkout@v7`, `actions/setup-node@v7`, etc. en el resto de los workflows (ninguno está pineado por SHA). Práctica común, severidad baja; no es una regresión de este cambio sino un patrón preexistente en todo el repo.
- El script remoto corre en un checkout dedicado a despliegue ("artefacto descartable", según el comentario del propio workflow, confirmado con Kevin) — `reset --hard`/`clean -fd` no arriesgan trabajo humano.

### 4.2 Endpoints admin nuevos

Revisados `PUT /admin/planes/:id/topes` (topes de descuento/recargo por plan), `DELETE /admin/ramos/:id` (eliminar ramo), y el permiso `puede_ver_descuento_plan`:

- Los 3 gateados correctamente: los dos primeros con `requireRole('admin')` literal (no delegable), consistente con la decisión ya documentada de que un permiso delegable (`puede_editar_planes`) no puede controlar su propio techo.
- `eliminarRamo` valida (planes/cotizaciones asociadas → 409) **antes** de borrar, y borra `correlativos` antes que `ramos` para respetar la FK — sin ventana en la que un fallo a mitad de camino deje estado huérfano.
- Payloads validados con Zod (`editarPlanTopesSchema`, `editarRamoSchema` con `.refine` para exigir al menos un campo).
- `resolverDescuentos()` (nuevo en `cotizacion.service.js`) fuerza el descuento del plan **server-side** cuando el usuario no tiene `puede_editar_descuento_plan`, descartando cualquier valor que venga en el body — el ocultamiento del campo en el frontend (`puede_ver_descuento_plan`) es puramente cosmético y no es el mecanismo de enforcement, consistente con la regla de "nunca confiar en el frontend" de `docs/standards/SECURITY.md`.

Sin hallazgos.

### 4.3 Cambios de frontend (responsive, accesibilidad)

El grueso del diff (sidebar hamburguesa, breakpoints, tablas a cards) es CSS/layout sin lógica de seguridad. Revisado que ningún cambio tocó `escapeHtml()` ni introdujo nuevas interpolaciones directas a `innerHTML` — no aplica.

---

## 5. Hallazgos abiertos (heredados, sin cambios desde 2026-07-30)

No son hallazgos nuevos de esta corrida; se listan por trazabilidad, ya trackeados en `CLAUDE.md` (roadmap pre-producción) y en la auditoría anterior.

1. 🟠 **Medio** — JWT y perfil de usuario en `localStorage` (`frontend/shared/api.js`), no en cookie `httpOnly`. Sigue pendiente (Sprint 4 del roadmap).
2. 🟡 **Bajo** — Sin validación de arranque fail-fast para `JWT_SECRET` (sí existe para `FRONTEND_URL` en `backend/src/app.js`). Confirmado que sigue sin agregarse.
3. 🟡 **Bajo** — Sin cabeceras CSP en el frontend estático. El frontend ahora se sirve desde Vercel (no Netlify, cambio ya reflejado en `frontend/vercel.json`) — el archivo `vercel.json` solo define `Cache-Control`, sigue sin CSP/`X-Frame-Options`/etc.
4. 🟡 **Bajo** — Nota de Fase 4 (Propuesta Formal/KYC): `aceptar`/`pdfPropuesta` en `cotizaciones.controller.js` siguen sin pasar `req.usuario`. Sigue sin ser explotable porque las funciones subyacentes siguen siendo stubs de Fase 4 ("Fase 4 pendiente").

---

## 6. Metodología

Auditoría automatizada ejecutada por el mismo agente en una sola sesión, en modo incremental sobre la auditoría de 3 días antes:

- Diff completo `5e60309..HEAD` (42 archivos) revisado con foco en área de seguridad (CI/CD, auth, endpoints admin, dependencias).
- `npm audit` (con y sin `--omit=dev`) repetido sobre el estado actual.
- Barrido de secretos por patrón (regex) sobre el árbol trackeado completo + historial de archivos `.env*`.
- Lectura directa de los 2 workflows de GitHub Actions nuevos, middleware de auth, controllers/schemas de admin nuevos, y el service de resolución de descuentos.

No se ejecutaron pruebas dinámicas (DAST) ni pentesting activo contra ambientes desplegados — es una revisión estática de código fuente e infraestructura como código (workflows).
