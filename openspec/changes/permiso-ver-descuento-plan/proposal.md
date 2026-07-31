# Proposal: Permiso de rol para ver el campo Descuento

## Intent

El plan MRC "SEGUCOOP" tiene `descuento_default = 10`. Hoy, todo rol sin `puede_editar_descuento_plan` ve el campo Descuento deshabilitado con el hint "Descuento fijo del plan" (`cotizar.js:1983-2020`). Kevin quiere que **el admin decida por rol** si ese campo se muestra, sin tocar código cada vez que aparezca un caso nuevo. Hoy la visibilidad está atada por código a la capacidad de edición: no hay forma de ocultarlo a un rol sin hardcodear "agente".

Punto ya verificado: el 10% **no depende del frontend**. `resolverDescuentos()` (`cotizacion.service.js:474-485`) descarta lo que mande el cliente y fuerza `plan.descuento_default` cuando el usuario no puede editar. Ocultar el campo es **puramente visual**.

## Scope

### In Scope

- Migración `050_permiso_ver_descuento_plan.sql`: `ALTER TABLE roles ADD COLUMN puede_ver_descuento_plan BOOLEAN NOT NULL DEFAULT TRUE`. Sin `UPDATE`: el default preserva el comportamiento actual para todos los roles.
- Plumbing backend (mismo patrón que `puede_editar_descuento_plan`): `roles.repository.js` (CAMPOS), `usuarios.repository.js` (CAMPOS_ROL + `aplanar()`), `middleware/auth.js` (`req.usuario`), `admin/roles.service.js` (`PERMISOS_ROL`, para la validación anti-escalada), `admin.schema.js` (`crearRolSchema` con `.default(true)` / `editarRolSchema` opcional), `auth.service.js` (payload de `login()` → localStorage).
- Panel admin (`frontend/admin/admin.js`): checkbox en el modal de rol (crear/editar), lectura en `guardarModalRol`, badge en la tabla de Roles.
- Cotizador (`cotizar.js`, `renderAjusteField`): `oculto = bloqueado && usuario?.puede_ver_descuento_plan === false` → devuelve `''`.

### Out of Scope

- `resolverDescuentos()` y el cálculo del descuento (sin cambios).
- Campo **Recargo** (la lógica sigue acotada a `prefijo === 'descuento'`).
- Backfill retroactivo más allá del `DEFAULT TRUE`.
- Fase 2 (Auto), pausada.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `mrc-plan-descuento-fijo`: se agrega la regla de **visibilidad** del campo Descuento como permiso de rol independiente del permiso de edición.

## Approach

Permiso booleano nuevo en `roles`, réplica exacta del patrón de `puede_editar_descuento_plan` (cambio `mrc-plan-descuento-fijo`, migración 048, PR #60/#61). Default `TRUE` (confirmado por Kevin): migración no destructiva, nadie pierde visibilidad; el admin destilda el checkbox para los roles que correspondan (ej. agente). Tres estados resultantes en `renderAjusteField`:

| `puede_editar` | `puede_ver`    | Resultado                           |
| -------------- | -------------- | ----------------------------------- |
| true           | cualquiera     | campo editable (sin cambios)        |
| false          | true (default) | campo disabled + hint (sin cambios) |
| false          | false          | campo no se renderiza               |

## Affected Areas

| Área                                                    | Impacto  | Descripción                          |
| ------------------------------------------------------- | -------- | ------------------------------------ |
| `backend/migrations/050_permiso_ver_descuento_plan.sql` | New      | Columna en `roles`, default TRUE     |
| `backend/src/repositories/roles.repository.js`          | Modified | CAMPOS                               |
| `backend/src/repositories/usuarios.repository.js`       | Modified | CAMPOS_ROL + `aplanar()`             |
| `backend/src/middleware/auth.js`                        | Modified | `req.usuario`                        |
| `backend/src/services/admin/roles.service.js`           | Modified | `PERMISOS_ROL`                       |
| `backend/src/schemas/admin.schema.js`                   | Modified | `crearRolSchema` / `editarRolSchema` |
| `backend/src/services/auth.service.js`                  | Modified | payload de `login()`                 |
| `frontend/admin/admin.js`                               | Modified | Checkbox + badge en Roles            |
| `frontend/cotizar/cotizar.js`                           | Modified | `renderAjusteField` devuelve `''`    |
| `docs/ESTADO_PROYECTO.md`, `CLAUDE.md`                  | Modified | Registro de estado                   |

## Risks

| Riesgo                                                                                                                                                                                                                                                                         | Prob. | Mitigación                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bloqueado` hoy **no** contempla `!plan.cotizacion_combinada`, a diferencia de `resolverDescuentos()`. Con un plan de Auto `cotizacion_combinada=true` + `descuento_default`, el campo se ocultaría sin que el backend fuerce nada → el agente pierde el descuento en silencio | Media | Decidir en diseño si `bloqueado` se alinea con la condición del backend. Sin impacto hoy: Auto está pausado y `RAMOS_CON_AJUSTES = ['mrc','incendio']` |
| `auth.getUsuario()` es el valor cacheado al loguear: cambiar el permiso no se refleja hasta el próximo login                                                                                                                                                                   | Media | Documentar y exigir re-login en la verificación; el backend no depende de este valor                                                                   |
| Se interpreta el permiso como control de seguridad                                                                                                                                                                                                                             | Media | Dejar explícito en spec y migración: es **cosmético**; el cálculo lo blinda `resolverDescuentos()`                                                     |
| Conflicto con trabajo sin commitear en `admin.js` / `admin.schema.js` / `admin.controller.js` / `admin.routes.js` (topes por plan, eliminar ramo)                                                                                                                              | Media | Commitear o rebasar ese trabajo antes de aplicar                                                                                                       |
| Colisión de numeración de migración (precedente 046/048)                                                                                                                                                                                                                       | Baja  | Verificar el número libre contra `main` y ramas abiertas antes del PR                                                                                  |

## Rollback Plan

- **N1 (negocio)**: `UPDATE roles SET puede_ver_descuento_plan = TRUE` → todos vuelven al comportamiento actual, sin tocar código.
- **N2 (código)**: revertir el commit. La columna queda inerte; ningún dato queda huérfano y ninguna cotización se recalcula.
- **N3 (schema)**: `ALTER TABLE roles DROP COLUMN puede_ver_descuento_plan`. Cambio 100% aditivo, sin `DROP` ni cambio de tipo sobre columnas preexistentes.

## Dependencies

- Migración 048 (`puede_editar_descuento_plan`) ya aplicada contra Supabase real — prerequisito cumplido.
- Aplicar la migración contra Supabase real requiere confirmación explícita de Kevin (convención del proyecto).

## Success Criteria

- [ ] Migración aplicada; todos los roles quedan en `puede_ver_descuento_plan = true`.
- [ ] Admin puede destildar el permiso para el rol `agente` y persistirlo desde la sección Roles.
- [ ] Usuario `test@test.com` (rol agente, tras re-login) cotizando MRC/SEGUCOOP: el campo Descuento **no se renderiza**.
- [ ] La carta oferta de esa misma cotización sigue aplicando el 10%.
- [ ] Rol con `puede_ver = true` o con `puede_editar = true`: comportamiento sin cambios.
- [ ] El campo **Recargo** se renderiza igual en todos los casos.
- [ ] `npm test --prefix backend` en verde, sin regresión.

## Proposal question round

Preguntas para Kevin (no bloquean spec/design; sí pueden cambiar el diseño):

1. Si un rol tiene `puede_editar_descuento_plan = true` pero `puede_ver_descuento_plan = false`, ¿gana la edición (campo visible, supuesto actual) o se oculta igual?
2. ¿El permiso debe ocultar el campo **solo** cuando el plan tiene `descuento_default`, o también en planes sin descuento fijo (ocultar Descuento por rol de forma general)?
3. ¿La cotización guardada/carta oferta debe seguir mostrando la línea de descuento al rol que no puede verlo en el cotizador?

Supuestos asumidos si no hay corrección: (a) el permiso es **cosmético**, nunca de seguridad; (b) `puede_editar` prevalece sobre `puede_ver`; (c) solo aplica cuando `bloqueado` es verdadero (plan con `descuento_default`); (d) el Recargo nunca se ve afectado.
