# Plan — Fase 5: Panel Admin de configuraciones + Auth

## Context

Kevin pidió el apartado de configuraciones del admin en la web: definir/editar coberturas por defecto, editar tasas, crear usuarios con roles, y secciones adicionales razonables. Esto es el pedido ya registrado en `docs/ESTADO_PROYECTO.md` sección 8 (Fase 5). Hoy `frontend/admin/index.html` es un stub, no existe auth en runtime (la tabla `usuarios` con `rol` y `puede_editar_tasas` existe desde la migración 001 pero nada la usa), las coberturas fijas están hardcodeadas en `mrc.calculator.js` y las tasas solo cambian por migración SQL.

Decisiones tomadas con Kevin:
- Coberturas por defecto se configuran **por plan** vía `plan_coberturas.incluida_por_defecto` (ya existe).
- Auth con **JWT propio**: email+password contra `usuarios` (bcrypt), token firmado por Express.
- Login obligatorio para **toda la app**; el rol decide qué se ve. Se completa `cotizaciones.agente_id` desde el usuario autenticado (cierra TODO existente).

## Design decisions

1. **JWT propio**: `bcryptjs` + `jsonwebtoken`. Payload `{sub, rol, puede_editar_tasas}`, expiración 8h, `JWT_SECRET` por env. Middleware en cadena: `requireAuth` (rechaza `activo=false`) → `requireRole('admin')` → `requireTasasEdit`.
2. **Todo protegido salvo** `POST /api/auth/login` y `/health`. El endpoint existente `/api/admin/tasas/importar` (hoy abierto) queda detrás de admin + `puede_editar_tasas`.
3. **Edición de tasas con versionado por inserción**: `tasas_cobertura_ramo` ya tiene `vigente_desde` — editar = INSERT de fila nueva, nunca UPDATE. Historial gratis, cotizaciones viejas siguen explicables. Verificar que `tasas.repository.js` lea la fila con max(`vigente_desde` <= hoy).
4. **Refactor del hardcodeo** de `CODIGO_INCENDIO_EDIFICIO/CONTENIDO` en `mrc.calculator.js` para leer `plan_coberturas`: último work unit, aislado y diferible (verificable comparando prima antes/después).

## Work units (en orden)

### WU1 — Migración `backend/migrations/024_auth_usuarios.sql`
- `ALTER TABLE usuarios ADD password_hash TEXT, ultima_sesion TIMESTAMPTZ`.
- Seed del usuario admin de Kevin (hash bcrypt pre-generado, documentado en la migración).

### WU2 — Backend auth
- Nuevos: `middleware/auth.js`, `services/auth.service.js`, `repositories/usuarios.repository.js`, `controllers/auth.controller.js`, `routes/auth.routes.js`, `schemas/auth.schema.js`.
- Endpoints: `POST /api/auth/login`, `GET /api/auth/me`.
- Modificar [routes/index.js](backend/src/routes/index.js) (montar /auth público, `requireAuth` en el resto) y [cotizacion.service.js](backend/src/services/cotizacion.service.js) (`agente_id` desde `req.usuario.id`).

### WU3 — Backend endpoints admin
Nuevos: `routes/admin.routes.js`, `controllers/admin.controller.js`, `services/admin.service.js`, `schemas/admin.schema.js`; extender `coberturas.repository.js`, `tasas.repository.js`, repo de planes.

| Sección | Endpoints |
|---|---|
| Usuarios (solo admin) | `GET/POST /api/admin/usuarios`, `PUT /api/admin/usuarios/:id` (incluye desactivar), `PUT /api/admin/usuarios/:id/password` |
| Coberturas por plan | `GET/POST /api/admin/planes/:planId/coberturas`, `PUT/DELETE /api/admin/plan-coberturas/:id` (toggle `incluida_por_defecto`, monto/franquicia default, alta desde `coberturas_catalogo`) |
| Tasas (gate `puede_editar_tasas`) | `GET /api/admin/ramos/:ramoId/tasas`, `POST /api/admin/tasas` (inserta versión nueva) |
| Planes | `GET /api/admin/planes`, `PUT /api/admin/planes/:id` (`activo`, `prima_tecnica_minima`), `PUT /api/admin/plan-formas-pago/:id` (`tasa_rpf`) |

### WU4 — Frontend login
- Nueva página `frontend/login/`.
- [api.js](frontend/shared/api.js): header Bearer, helpers de token (localStorage), redirect a login en 401.
- Guard de token/rol y logout en los shells de cotizar/historial.

### WU5 — Frontend admin SPA
- `frontend/admin/admin.js` siguiendo el patrón de [cotizar.js](frontend/cotizar/cotizar.js) (app shell single-file, objeto `state`, sidebar de secciones):
  - **Usuarios**: listado, alta, edición de rol/`puede_editar_tasas`, desactivar, reset password.
  - **Coberturas por plan**: ramo → plan → tabla de `plan_coberturas` con toggle por defecto + montos; agregar/quitar coberturas del catálogo.
  - **Tasas**: edición de `tasas_cobertura_ramo` con historial de versiones (oculta sin `puede_editar_tasas`).
  - **Planes**: activo, prima técnica mínima, RPF por forma de pago.

### WU6 — Refactor `mrc.calculator.js`
- Coberturas fijas leídas de `plan_coberturas` en vez de constantes. Actualizar checklist de `CLAUDE.md` y `docs/ESTADO_PROYECTO.md`.

**MVP** = WU1–WU5. **Después**: editor de `rubros_actividad`, editor JSONB de `tarifas_generico` (Vida/AP), `tasas_capital` (Auto), UI de importación Excel dentro del shell admin, cambio de password propio, RLS en Supabase.

## Verification

- Por WU, a nivel curl: 401 sin token; 403 para rol agente en `/api/admin/*` y para edición de tasas sin `puede_editar_tasas`.
- E2E con la skill `run-cotizador`: login → cotizar MRC (confirmar `agente_id` persistido) → en admin: crear usuario, togglear una cobertura por defecto, editar una tasa y recotizar para ver el cambio aplicado, desactivar un plan y confirmar que sale del selector.
- WU6: prima idéntica de MRC Normal antes y después del refactor.

## Critical files

- [backend/src/routes/index.js](backend/src/routes/index.js)
- [backend/src/services/cotizacion.service.js](backend/src/services/cotizacion.service.js)
- [frontend/shared/api.js](frontend/shared/api.js)
- [backend/src/repositories/tasas.repository.js](backend/src/repositories/tasas.repository.js)
- [frontend/cotizar/cotizar.js](frontend/cotizar/cotizar.js) (patrón para admin.js)
