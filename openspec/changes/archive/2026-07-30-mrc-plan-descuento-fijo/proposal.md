# Proposal: MRC — plan nuevo con descuento fijo del 10% y permiso para editarlo

## Intent

Kevin necesita vender un plan de MRC con **una sola forma de pago (Contado)** y un **descuento comercial fijo del 10%** que el agente común no pueda alterar. Hoy no existe ningún concepto de "descuento del plan": el descuento del panel "Ajustes (opcionales)" es 100% discrecional del agente, arranca vacío y el backend solo lo clampea contra `plan.descuento_maximo` / `usuarios.descuento_maximo_pct`. El resultado es que la política comercial del plan depende de que cada agente se acuerde de tipear "10" a mano.

## Hallazgos de la investigación (corrigen el brief inicial)

1. **No hay ningún "10%" mal configurado que arreglar.** Lo único parecido es `plan_formas_pago.tasa_rpf`, que es un **recargo** por forma de pago y en Contado siempre vale 0. El descuento del plan es funcionalidad nueva.
2. **El permiso NO va en `usuarios`.** La migración 031 movió los permisos a la tabla `roles` e hizo `DROP COLUMN usuarios.puede_editar_tasas` (031:41). `usuarios.repository.js` los aplana sobre el usuario, y `auth.js:39-50` los copia a `req.usuario`. El permiso nuevo va como **columna de `roles`**, no de `usuarios`.
3. **El cotizador SÍ conoce al usuario logueado.** `frontend/cotizar/cotizar.js:1952` ya llama `auth.getUsuario()` dentro de `renderAjusteField` — justo el campo a bloquear. No hace falta cablear sesión nueva.
4. **`planes.descuento_default` existe y está libre para MRC.** Definida en `002_ramos_planes.sql:21`, leída en un solo lugar (`cotizacion.service.js:543`, dentro de `resolverTiposFranquicia`), alcanzable solo por la rama `plan.cotizacion_combinada` de Auto. MRC no la ejecuta: no hay colisión funcional, solo hay que documentar la reutilización.
5. **`findPlanesByRamoId` usa `select('*')`** (`ramos.repository.js:42-43`), así que `descuento_default` ya viaja al frontend sin tocar el endpoint.
6. Las líneas del brief no derivaron: la carga inicial sigue en `cotizar.js:582` y `selectPlan` en `610-614`.

## Scope

### In Scope

- Migración `046_plan_mrc_descuento_fijo.sql`: `ALTER TABLE roles ADD COLUMN puede_editar_descuento_plan BOOLEAN NOT NULL DEFAULT FALSE` (+ `TRUE` para el rol `admin`), alta del plan MRC nuevo con `descuento_default = 10` y `descuento_maximo >= 10`, y sus 4 filas en `plan_formas_pago` (contado `habilitada=true, tasa_rpf=0`; cobrador/boca_cobranza/tarjeta `habilitada=false`), mismo patrón que `012_seed_mrc.sql`.
- Backend: resolver los descuentos en `construirVariantes` (`cotizacion.service.js:470-480`) **antes** de pasarlos al calculador — si `plan.descuento_default != null` y el usuario no tiene el permiso, se ignora lo que mandó el body y se fuerza `[{ descripcion: 'Descuento del plan', porcentaje: plan.descuento_default }]`. Con el permiso, se respeta el body como hoy.
- `auth.js` (`req.usuario` + `requireDescuentoPlanEdit` si hace falta gate de ruta), `roles.repository.js` (COLUMNS), `admin.schema.js` (`crearRolSchema` / `editarRolSchema`).
- Admin frontend: checkbox del permiso en la sección **Roles** (no en el form de usuario).
- Cotizador: prefill `state.data.descuentoPorcentaje = plan.descuento_default ?? null` en `cotizar.js:582` y `selectPlan`, y `disabled` en los dos inputs de Descuento cuando el plan trae `descuento_default` y el usuario no tiene el permiso.

### Out of Scope

- Descuento fijo en Incendio, Vida/AP o Auto (la mecánica queda genérica, pero solo se siembra el plan de MRC).
- Habilitar/deshabilitar formas de pago: ya resuelto por el toggle existente del panel admin.
- UI de admin para editar `descuento_default` por plan (hoy `editarPlanSchema` no lo incluye; se ajusta por SQL).
- Migrar cotizaciones ya emitidas.

## Capabilities

### New Capabilities

- `plan-descuento-fijo`: descuento comercial definido por el plan, aplicado automáticamente y no editable salvo permiso explícito de rol.

### Modified Capabilities

- None.

## Approach

La regla vive en `cotizacion.service.js` (no en el calculador de MRC) porque es transversal a todo plan con `descuento_default` y mantiene los calculadores puros: el calculador sigue recibiendo `descuentos` ya resueltos y aplicando `sumarAjustes` + `topeEfectivo` sin enterarse de permisos. Se reutiliza `planes.descuento_default` en vez de agregar columna nueva, documentando en el comentario de la migración que MRC no pasa por `resolverTiposFranquicia`. El bloqueo es de **backend primero** (el `disabled` del input es solo cortesía visual): un POST directo a `/cotizaciones/calcular` con otro descuento debe seguir cotizando al 10%.

## Affected Areas

| Área                                                 | Impacto  | Descripción                                                       |
| ---------------------------------------------------- | -------- | ----------------------------------------------------------------- |
| `backend/migrations/046_plan_mrc_descuento_fijo.sql` | New      | Permiso en `roles`, plan MRC, formas de pago                      |
| `backend/src/services/cotizacion.service.js`         | Modified | Resolución de descuentos en `construirVariantes`                  |
| `backend/src/middleware/auth.js`                     | Modified | Nuevo permiso en `req.usuario`                                    |
| `backend/src/repositories/roles.repository.js`       | Modified | Columna nueva en el `SELECT`                                      |
| `backend/src/repositories/usuarios.repository.js`    | Modified | Aplanado del permiso nuevo                                        |
| `backend/src/schemas/admin.schema.js`                | Modified | `crearRolSchema` / `editarRolSchema`                              |
| `frontend/admin/admin.js`                            | Modified | Checkbox del permiso en Roles                                     |
| `frontend/cotizar/cotizar.js`                        | Modified | Prefill (`582`, `selectPlan`) + `disabled` en `renderAjusteField` |
| `docs/ESTADO_PROYECTO.md`, `CLAUDE.md`               | Modified | Registro de estado                                                |

## Risks

| Riesgo                                                                                                                                                                                                                                   | Prob.    | Mitigación                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| El 10% forzado se clampea: pasa por `sumarAjustes` con `topeEfectivo(plan.descuento_maximo, usuario.descuento_maximo_pct)` — si el tope del plan o del usuario es menor a 10, el descuento del plan queda por debajo del 10% en silencio | **Alta** | Sembrar `descuento_maximo >= 10`; decidir en diseño si el descuento del plan ignora el tope del usuario (es política de la empresa, no discrecionalidad del agente) o si se rechaza con 422 en vez de clampear callado |
| `auth.getUsuario()` es el valor cacheado al loguear (ver comentario en `cotizar.js:1955-1957`): otorgar el permiso no se refleja hasta el próximo login                                                                                  | Media    | Documentarlo y exigir re-login en la verificación manual; el backend igual lee el valor fresco por request                                                                                                             |
| Permiso puesto en `usuarios` por inercia del brief → columna muerta                                                                                                                                                                      | Media    | Ya corregido acá: va en `roles` (hallazgo 2)                                                                                                                                                                           |
| Reutilizar `descuento_default` acopla MRC a la rama de franquicia de Auto si Fase 2 se retoma                                                                                                                                            | Baja     | Test de regresión sobre `resolverTiposFranquicia`; comentario explícito en la migración                                                                                                                                |
| Bloqueo solo de UI (bypass por API)                                                                                                                                                                                                      | Media    | Test obligatorio: usuario sin permiso manda otro descuento → el backend aplica 10% igual                                                                                                                               |
| Los otros planes de MRC/Incendio (sin `descuento_default`) cambian de comportamiento                                                                                                                                                     | Baja     | La rama solo se activa con `descuento_default != null`; tests de no-regresión sobre los 154 actuales                                                                                                                   |

## Rollback Plan

- **N1 (negocio)**: `UPDATE planes SET activo = FALSE` para el plan nuevo — desaparece del selector sin tocar código. El permiso queda inerte porque ningún plan activo tiene `descuento_default`.
- **N2 (código)**: revertir el commit. `descuento_default` vuelve a ser leído solo por Auto; ningún dato queda huérfano.
- **N3 (schema)**: `DELETE FROM plan_formas_pago WHERE plan_id = <id>` → `DELETE FROM planes WHERE id = <id>` (falla con FK si ya tiene cotizaciones: en ese caso quedarse en N1) y `ALTER TABLE roles DROP COLUMN puede_editar_descuento_plan`. Ambos cambios son aditivos: no hay `DROP` ni cambio de tipo sobre columnas preexistentes, y las cotizaciones emitidas guardan el total de descuento ya aplicado (`cotizacion_ajustes`), así que no se recalculan.

## Dependencies / Preguntas abiertas de negocio

1. **Nombre exacto del plan MRC nuevo** — sin confirmar. **Bloquea aplicar la migración contra Supabase real, NO bloquea spec/design/tasks**: la migración se escribe con un placeholder explícito y solo se aplica con el visto bueno de Kevin.
2. ¿El descuento del plan debe ignorar `usuarios.descuento_maximo_pct`? Sugerido: sí — es política de empresa, no discrecionalidad del agente. Pendiente de confirmar (bloquea diseño, no propuesta).
3. ¿Qué rol(es) reciben `puede_editar_descuento_plan = TRUE` además de `admin`? Pendiente.
4. ¿El plan nuevo hereda las coberturas y el texto legal de un plan MRC existente, o trae los suyos? Pendiente.

## Success Criteria

- [ ] Al elegir el plan nuevo en el cotizador, el campo Descuento muestra 10% precargado y deshabilitado para un usuario sin el permiso.
- [ ] Solo aparece "Contado" como forma de pago para ese plan.
- [ ] Un usuario **sin** el permiso que manda otro descuento por `POST /cotizaciones/calcular` obtiene igual una prima con 10% de descuento (el bloqueo no es solo de UI).
- [ ] Un usuario **con** el permiso puede editar el campo y el backend respeta su valor (dentro de los topes vigentes).
- [ ] La prima final del plan refleja el 10% completo, sin clamp silencioso.
- [ ] Los planes sin `descuento_default` (todos los actuales de MRC/Incendio/Vida-AP) no cambian de comportamiento.
- [ ] `npm test --prefix backend` en verde, sin regresión sobre los 154 tests actuales.

## Proposal question round

Preguntas abiertas listadas arriba (Dependencies 1-4). Supuestos asumidos que Kevin debería corregir si están mal: (a) el descuento del plan es política de empresa y por eso puede ignorar el tope propio del usuario; (b) el permiso es de **rol**, no de usuario individual, siguiendo el modelo de la migración 031; (c) el plan nuevo es de MRC únicamente y ningún plan existente recibe `descuento_default`; (d) las cotizaciones ya emitidas no se reexpresan.
