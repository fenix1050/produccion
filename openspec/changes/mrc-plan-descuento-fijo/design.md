# Design: MRC — plan con descuento fijo del 10% y permiso de rol para editarlo

## Technical Approach

El descuento se **resuelve en el service** (`cotizacion.service.js#construirVariantes`), donde ya conviven `plan` y `usuario`, y se pasa al calculador ya resuelto más un flag `descuentoForzadoPorPlan`. El calculador sigue puro (no conoce permisos): solo usa el flag para decidir qué topes combina. El bloqueo es server-side; el `disabled` del input es cortesía visual.

## Architecture Decisions

### Decision 1 — Punto de enforcement: service, no calculador

| Opción                         | Tradeoff                                                                             | Decisión    |
| ------------------------------ | ------------------------------------------------------------------------------------ | ----------- |
| `construirVariantes` (service) | Único punto donde ya están `plan` + `usuario`; sirve a todo ramo; calculadores puros | **Elegida** |
| Dentro de `mrc.calculator.js`  | Duplicaría la regla por ramo y metería permisos en la capa de cálculo                | Rechazada   |
| Middleware/Zod                 | No conoce el `plan` (se resuelve después de validar)                                 | Rechazada   |

Helper puro nuevo, exportado para test directo:

```js
// cotizacion.service.js
export function resolverDescuentos({ plan, descuentosBody, usuario }) {
  const aplica = plan.descuento_default != null && !plan.cotizacion_combinada
  if (!aplica || usuario?.puede_editar_descuento_plan) {
    return { descuentos: descuentosBody ?? [], forzadoPorPlan: false }
  }
  return {
    descuentos: [{ descripcion: 'Descuento del plan', porcentaje: plan.descuento_default }],
    forzadoPorPlan: true,
  }
}
```

### Decision 2 — El 10% forzado NO se somete al tope del usuario, SÍ al del plan

**Hallazgo que corrige la mitigación de la propuesta**: sembrar `descuento_maximo >= 10` **no alcanza**. `topeEfectivo(topePlan, topeUsuario)` devuelve `Math.min(...)` (`utils/ajustes.js:17-21`), así que un agente con `descuento_maximo_pct = 5` clampea el 10% del plan a 5% en silencio, sin importar el tope del plan.

| Opción                                                                     | Tradeoff                                                                                   | Decisión    |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------- |
| Solo sembrar `descuento_maximo >= 10`                                      | **No resuelve**: el tope del usuario sigue clampeando                                      | Rechazada   |
| Bypass total de `topeEfectivo`                                             | Pierde el techo del plan; más lógica especial                                              | Rechazada   |
| Neutralizar **solo** el tope del _usuario_ cuando el descuento es del plan | Un one-liner; política de empresa ≠ discrecionalidad del agente; el plan conserva su techo | **Elegida** |
| 422 en vez de clampear                                                     | Rompe cotizaciones válidas por config de un tercero                                        | Rechazada   |

En `mrc.calculator.js:236`:

```js
topeEfectivo(plan.descuento_maximo, forzadoPorPlan ? null : usuario?.descuento_maximo_pct)
```

`forzadoPorPlan` entra a `calcularPrima` con default `false` → cero cambio de comportamiento para los planes actuales. Mismo one-liner en `incendio.calculator.js` por simetría (inerte hoy). `auto.calculator.js` no usa `topeEfectivo`: no se toca.

**`descuento_maximo` del plan nuevo = 10** (no 30 como `MULTIRRIESGO COMERCIO - NORMAL`): el 10% es la política comercial completa del plan, así que también es el techo para el usuario _con_ permiso. Con 10 el clamp es un no-op exacto en la ruta forzada.

### Decision 3 — Guarda `!plan.cotizacion_combinada` (regresión real evitada)

`008_seed_planes_auto.sql` ya carga `descuento_default` en **PLAN TAJY PREMIUM / SUPERIOR / FUERTE**, los tres con `cotizacion_combinada = TRUE`, donde `resolverTiposFranquicia` (`cotizacion.service.js:542-548`) lo consume para la variante con franquicia. Sin la guarda, reutilizar la columna forzaría además un descuento sobre la prima de Auto → **doble descuento**. `!plan.cotizacion_combinada` es exactamente la condición complementaria a la rama de franquicia: los dos consumidores quedan mutuamente excluyentes por construcción.

## Data Flow

    POST /cotizaciones/calcular
      → requireAuth ─ usuarios.repository.aplanar() → req.usuario.puede_editar_descuento_plan
      → construirVariantes(plan, usuario, body.descuentos)
          → resolverDescuentos() ─→ { descuentos, forzadoPorPlan }
          → calculador.calcularPrima({ descuentos, forzadoPorPlan, usuario, plan })
              → sumarAjustes(descuentos, primaBase,
                   topeEfectivo(plan.descuento_maximo, forzadoPorPlan ? null : usuario.descuento_maximo_pct))

## Migration 046 (`046_plan_mrc_descuento_fijo.sql`)

046 confirmado como siguiente número (045 es el último en `backend/migrations/`).

1. `ALTER TABLE roles ADD COLUMN puede_editar_descuento_plan BOOLEAN NOT NULL DEFAULT FALSE;`
2. `UPDATE roles SET puede_editar_descuento_plan = TRUE WHERE nombre = 'admin';` — obligatorio hacerlo acá: `admin` es `es_sistema = TRUE` y `editarRol` lo rechaza con 409 desde el panel.
3. `INSERT INTO planes (ramo_id, nombre, prima_tecnica_minima, cotizacion_combinada, descuento_default, descuento_maximo, recargo_maximo, cuotas_default, cuotas_maximo) SELECT id, '<<PLACEHOLDER_NOMBRE_PLAN>>', …, FALSE, 10, 10, 20, 0, 0 FROM ramos WHERE nombre = 'mrc';` — `cotizacion_combinada = FALSE` es requisito de la Decisión 3.
4. `plan_formas_pago`: patrón `CROSS JOIN (VALUES …)` de `012_seed_mrc.sql:210-220`, con `('contado', 0.0, TRUE)`, `('cobrador', 0.0, FALSE)`, `('boca_cobranza', 0.0, FALSE)`, `('tarjeta_credito', 0.0, FALSE)`.
5. Comentario de cabecera: por qué se reutiliza `descuento_default` y por qué la guarda `cotizacion_combinada` protege a Auto.

**Rollback**: N1 `UPDATE planes SET activo = FALSE`; N2 revertir el commit (la columna queda inerte); N3 `DELETE FROM plan_formas_pago WHERE plan_id = X` → `DELETE FROM planes WHERE id = X` (409/FK si ya tiene cotizaciones ⇒ quedarse en N1) → `ALTER TABLE roles DROP COLUMN puede_editar_descuento_plan`. Todo aditivo, sin `DROP` ni cambio de tipo sobre columnas preexistentes.

**Nota de proceso (no de schema)**: el nombre del plan queda como placeholder literal. **La migración no se aplica contra Supabase real hasta que Kevin confirme el nombre exacto.** Se commitea igual; se aplica después.

## Role/permission plumbing (sin cambios estructurales)

| Archivo                                    | Cambio                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `repositories/roles.repository.js:3-4`     | agregar el campo a `CAMPOS` (`crear()` lo pasa explícito)                                           |
| `repositories/usuarios.repository.js:9-22` | agregar a `CAMPOS_ROL` y a `aplanar()` (`?? false`)                                                 |
| `middleware/auth.js:39-50`                 | agregar a `req.usuario` (junto a los otros 4 `puede_*`)                                             |
| `services/admin/roles.service.js:8`        | agregar a `PERMISOS_ROL`                                                                            |
| `schemas/admin.schema.js:28-49`            | `crearRolSchema` (`.default(false)`) y `editarRolSchema` (`.optional()`)                            |
| `services/auth.service.js:54-68`           | agregar al `usuario` de la respuesta de login (es lo que persiste `setUsuario`)                     |
| `frontend/admin/admin.js`                  | checkbox en `abrirModalRolCrear`/`Editar`/`guardarModalRol` + columna de badge en la tabla de Roles |

No hace falta `requireDescuentoPlanEdit`: no hay ruta nueva que gatear, la regla es de cálculo. `PUT /admin/roles/:id` ya existe y no cambia de forma.

## Frontend (cotizar.js)

`auth.getUsuario()` (`frontend/shared/api.js:19-26`) devuelve el objeto **plano** de `localStorage['tajy_usuario']` — los `puede_*` están al nivel superior, no anidados en un `rol`. Por eso el punto 6 de arriba (login) es obligatorio, si no el flag nunca llega al cliente.

- `cotizar.js:582` y `selectPlan` (610-621): `state.data.descuentoPorcentaje = plan?.descuento_default ?? null` junto al `cuotas_default` que ya se setea ahí.
- `renderAjusteField` (1950): ya llama `auth.getUsuario()` en 1952. Agregar
  `const bloqueado = prefijo === 'descuento' && plan?.descuento_default != null && !usuario?.puede_editar_descuento_plan`
  y sumar `bloqueado` a los `disabled` ya existentes de los dos inputs (1988, ~1996) — mismo patrón de deshabilitado mutuo monto/porcentaje que ya vive ahí. Texto de ayuda: "Descuento fijo del plan".
- `auth.getUsuario()` es el valor cacheado al loguear (ver comentario 1955-1957): otorgar el permiso exige **re-login** para que la UI lo refleje. El backend lee el valor fresco por request.

## Testing Strategy

| Layer       | Qué                                                                                                                                                                                  | Cómo                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| Unit        | `resolverDescuentos`: sin `descuento_default` → body intacto; con permiso → body intacto; sin permiso → fuerza 10% ignorando el body; `cotizacion_combinada=true` → **nunca** fuerza | Vitest sobre el helper exportado |
| Unit        | `mrc.calculator`: `forzadoPorPlan=true` + `usuario.descuento_maximo_pct=5` → descuento = 10% completo; `forzadoPorPlan=false` → clamp a 5% (no-regresión)                            | Vitest                           |
| Integración | POST `/cotizaciones/calcular` con `descuentos: [{porcentaje: 40}]` y usuario sin permiso → prima con 10%                                                                             | Test de service (bypass por API) |
| Regresión   | 154 tests actuales en verde; `resolverTiposFranquicia` de Auto sin cambios                                                                                                           | `npm test --prefix backend`      |

## Threat Matrix

N/A — no hay routing dinámico, shell, subprocess, automatización VCS/PR ni clasificación de archivos ejecutables. Es una regla de autorización de datos, cubierta por los tests de bypass por API.

## Open Questions

- [ ] Nombre exacto del plan (bloquea aplicar la migración, no el código).
- [ ] `descuento_maximo = 10` vs. un techo mayor para el usuario con permiso — asumido 10.
- [ ] Roles además de `admin` con el permiso.
- [ ] Coberturas / texto legal del plan nuevo (¿hereda de `MULTIRRIESGO COMERCIO - NORMAL`?). Sin `plan_coberturas` el plan cotiza pero sale sin sublímites.
- [ ] `cuotas_default`/`cuotas_maximo` para un plan solo-contado: asumido `0`/`0`.
