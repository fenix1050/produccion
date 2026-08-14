# Design: Red de seguridad de tests para la lógica de cotización (frontend)

Change: `cotizacion-modularizacion` | Store: hybrid | Base: `sdd/cotizacion-modularizacion/proposal` + `proposal-decisions`.

## Technical Approach

Tests de caracterización con `node:test` + `node:assert/strict`, colocados junto al módulo (precedente real: `frontend/shared/dom.test.js`). Solo se agregan archivos `*.test.js` nuevos: cero líneas de producción tocadas, cero cambios en `backend/`, `cotizacion.service.js`, calculadores o migraciones. Los tests describen lo que el código YA hace; si un assert falla, se corrige el test, nunca el código.

## Architecture Decisions

### Decision: bootstrap de DOM vía `import()` dinámico dentro del propio `*.test.js`

**Choice**: cada test crea un `JSDOM`, asigna `globalThis.document`, y recién después hace `await import('./state.js' | './domain-rules.js' | './body-builder.js')` (top-level await en ESM).
**Alternatives**: (a) import estático directo — imposible; (b) módulo de setup compartido `test-setup.js`.
**Rationale**: `frontend/cotizar/state.js:74` ejecuta `document.getElementById('app')` en el tope del módulo. `domain-rules.js` y `body-builder.js` importan `state.js`, así que **sí necesitan jsdom** pese a ser funciones puras. (b) exigiría un archivo no-`*.test.js`, violando el criterio "cero líneas fuera de `*.test.js`"; el costo es ~5 líneas duplicadas por archivo.

### Decision: `resetState()` local por archivo en un `beforeEach`

**Choice**: helper local que reasigna los campos mutables usados (`ramoId`, `planId`, `planes`, `data`, `preview`, `previewError`, `formaPagoCodigo`, `franquiciasPorCobertura`, `coberturasCatalogo`, `planCoberturas`, `coberturasAdicionales`, `coberturasAdicionalesEditando`).
**Alternatives**: inyectar estado por parámetro (exige tocar producción); un test por proceso.
**Rationale**: `state` es un singleton mutable exportado; sin reset hay falsos verdes por orden de ejecución (riesgo #2 de la propuesta).

### Decision: no `globals.node` en tests

**Choice**: usar solo `import`s de `node:*`, `globalThis` y globals de browser.
**Rationale**: `eslint.config.mjs:67` da a `frontend/**/*.js` únicamente `globals.browser` con `no-undef: error`. Usar `process`/`global`/`__dirname` rompe `npm run lint`.

### Decision: marcador `// CARACTERIZACIÓN` de doble vía

**Choice**: comentario `// CARACTERIZACIÓN: <qué se congela y por qué es sospechoso>` inmediatamente arriba del assert, **y** prefijo `[CARACTERIZACIÓN]` en el nombre del `test(...)`.
**Rationale**: el comentario es grepeable (`rg "CARACTERIZACI" frontend/cotizar/*.test.js` — sin la vocal acentuada, para evitar problemas de encoding en PowerShell) y el prefijo hace que la propia salida de `node --test` liste los casos congelados para el verify-report.

### Decision: fixtures inline, sin mocks de módulo

**Choice**: objetos literales `plan`/`state.data` inline por test; sin `mock.module`, sin stubs de red.
**Rationale**: los únicos imports de ambos módulos son `state.js` y `constants.js` (datos puros). No hay `fetch`, ni `api.js`, ni imports cruzados hacia backend o hacia RPC atómico — confirmado leyendo los dos archivos. Constantes reales, no duplicadas, para que un cambio de catálogo rompa el test.

## Data Flow

    JSDOM → globalThis.document ──→ state.js (singleton mutable)
                                        │
              beforeEach: resetState() ─┤
                                        ↓
            fixture (plan + state.data) → domain-rules / body-builder → assert
                                                    │
                                        armarRiesgoDatos() → riesgo_datos (payload congelado)

## File Changes

| File                                    | Action | Description                                         |
| --------------------------------------- | ------ | --------------------------------------------------- |
| `frontend/cotizar/domain-rules.test.js` | Create | PR #1 — reglas puras y gates                        |
| `frontend/cotizar/body-builder.test.js` | Create | PR #2 (encadenado) — armado/restauración de payload |

Sin cambios en `frontend/cotizar/*.js`, `backend/**`, `migrations/**`, `package.json` (el script `test` ya cubre `**/*.test.js`).

## Cobertura por función

**PR #1 — `domain-rules.test.js` (tier 1, obligatorio)**

| Función                                                                                               | Casos                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `planEsCalculable`                                                                                    | plan `null`; vida-ap dentro/fuera de `PLANES_VIDA_AP_CALCULABLES`; `prima_tecnica_minima` `0` (calculable) vs `null`/ausente                                                                                             |
| `monedaEfectiva`                                                                                      | `'MAQUINARIA BASICO'` → USD **aunque** su `tipo_mecanica` sea otro; `objeto_riesgo` → `state.data.moneda` con fallback `'PYG'`; resto → `'PYG'`; plan `null` → `'PYG'`                                                   |
| `datosMinimosCompletos`                                                                               | mrc (rubro+ciudad+capital>0); incendio en sus 3 ramas; vida-ap `PROTECCION FAMILIAR` vs resto (exige `edad`); ramo fuera de `RAMOS_CON_CALCULO` → `false`                                                                |
| `capitalAseguradoParaBody`                                                                            | misma triage de incendio; suma edificio+contenido en mrc; `0` en ramo desconocido                                                                                                                                        |
| **Triage cruzada**                                                                                    | un test que corre el mismo plan por las **4** sedes de la duplicación (`monedaEfectiva`, `datosMinimosCompletos`, `capitalAseguradoParaBody`, `armarRiesgoDatos`) y afirma que coinciden — baseline medible del change 3 |
| `sugerenciaInspeccion`                                                                                | cada `return null` (plan null, mecánica distinta, `requiere_inspeccion` null, umbral null, suma ≤ 0, moneda distinta, coincidencia con el flag) + los 2 mensajes                                                         |
| `puedeAvanzarADetalle`                                                                                | ramo sin calculador → `true` (permisivo); con preview; con `previewError`                                                                                                                                                |
| `sumaObjetoRiesgo`, `franquiciaValorPorDefecto`, `franquiciasPorCoberturaParaBody`, `ajustesParaBody` | valores típicos + prioridad monto sobre porcentaje + ramo sin ajustes → `[]`                                                                                                                                             |

**Tier 2 (si el presupuesto lo permite, mismo PR)**: `sublimiteVentanillaCalculado`, `sublimitesFijosMrc`, `coberturasPrincipalesFijasMrc`, `capitalTotalAsegurado`, `formasPagoDisponibles`, `formaPagoSeleccionada`, `quedanCoberturasAdicionalesPorAgregar`.

**PR #2 — `body-builder.test.js`**: `armarRiesgoDatos` por ramo/rama (incluida la default `{}` para `'auto'`, que es la barrera que mantiene Auto fuera de alcance), `prefillDatosDesdeCotizacion` (round-trip contra `armarRiesgoDatos`), `idLinea` (unicidad + fallback sin `crypto.randomUUID`).

> Corrección a la propuesta: `camposEspecificosParaRamo` **no existe**. Los exports reales de `body-builder.js` son `prefillDatosDesdeCotizacion`, `idLinea` y `armarRiesgoDatos`.

## Candidatos `// CARACTERIZACIÓN` ya detectados

1. `datosMinimosCompletos`/incendio: `MAQUINARIA BASICO` no exige `rubroActividad`, y `objeto_riesgo` no exige `ciudad`, mientras la rama default exige ambos.
2. `armarRiesgoDatosVidaAp`: `Number(d.edad) || null` convierte `edad = 0` en `null`.
3. `prefillDatosDesdeCotizacion`/mrc: escribe `state.franquiciasPorCobertura` de forma aditiva, sin limpiar claves previas.
4. `formasPagoDisponibles`: un `codigo` fuera de `ORDEN_FORMAS_PAGO` da `indexOf === -1` y queda primero.
5. `franquiciasPorCoberturaParaBody`: un `valor` desconocido produce `null`, indistinguible de `'sin_deducible'`.
6. `armarRiesgoDatosMrc(plan)` recibe `plan` y no lo usa.

Ninguno se corrige en este change (decisión de producto #2).

## Testing Strategy

| Layer       | What                                 | Approach                                                                               |
| ----------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| Unit        | `domain-rules.js`, `body-builder.js` | `node --test`, jsdom para `document`, fixtures inline, `beforeEach` con `resetState()` |
| Integration | —                                    | N/A (sin red ni backend en alcance)                                                    |
| E2E         | —                                    | Sin cambios: la cobertura Playwright en vivo existente sigue igual                     |

Gate: `npm run check` en verde (format + lint + backend 154/154 + frontend).

## Threat Matrix

N/A — sin routing, shell, subprocesos, automatización VCS/PR, clasificación de ejecutables ni integración de procesos. Solo archivos de test nuevos.

## Migration / Rollout

No migration required. Rollback = borrar los `*.test.js` o `git revert` del merge.

## Open Questions

- Ninguna que bloquee. `puedeAvanzarADetalle`/`formaPagoSeleccionada` dependen de `state.preview`, que se fixturea a mano; no requiere decisión de producto.
