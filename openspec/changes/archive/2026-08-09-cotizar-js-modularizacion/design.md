# Design: Modularizar `frontend/cotizar/cotizar.js`

## Technical Approach

Pure move bottom-up over an acyclic import graph, replicando `admin-module-split`. Layers (leaf → root):

    state.js → constants.js → domain-rules.js → body-builder.js
             → render/render-campos.js → render-cotizacion-vivo.js → render-datos.js
             → render/render-detalle-plan.js → render/render-shell.js
             → actions.js → events.js → cotizar.js (bootstrap)

`render/*` nunca importa `actions.js` (solo emite `data-action`); `actions.js` SÍ importa render (`renderApp`, `renderLivePanel`). Por eso todo el render se extrae ANTES que `actions.js`.

## Architecture Decisions

| # | Decisión | Alternativa rechazada | Razón |
|---|----------|----------------------|-------|
| 1 | **Callee-closure rule**: una función solo se mueve cuando todos sus callees ya están en un módulo de nivel igual/inferior | Mover por bloques de líneas contiguas | Mover un caller antes que su callee obliga a importar desde `cotizar.js` (raíz) → ciclo |
| 2 | **Create-then-grow**: un módulo grande se crea en un PR con un subconjunto callee-cerrado y crece en PRs siguientes | Un módulo = un PR | `render-datos.js` (~450 líneas) y `actions.js` (~452) no entran en 400 líneas de diff |
| 3 | `idParaCampo` → nuevo `render/render-campos.js` (hoja del layer render) | Dejarlo en `render-datos.js` e importarlo desde los otros | `render-datos` ya importa `renderLivePanelContent` de `render-cotizacion-vivo` → sería ciclo real |
| 4 | `renderStepper` + `renderPlanRow` → `render-datos.js` (no `render-shell.js` como sugería la exploración) | Dejarlos en shell | Solo los usa `renderDatosView`; en shell producen ciclo shell↔datos |
| 5 | `puedeAvanzarADetalle` → `domain-rules.js` | Dejarlo en render-shell | Lo usan render-shell, render-datos y `syncAvanceButtons` (actions) |
| 6 | `armarRiesgoDatos` y `camposEspecificosParaRamo` se mueven verbatim como `switch` con `case` literal | Dispatch table por objeto | CodeQL `js/unvalidated-dynamic-method-call` (precedente PR #104) |
| 7 | 22 slices bajo presupuesto de 400 líneas | 10 PRs módulo-a-módulo con `size:exception` (ruta admin) | Respeta el guard; la alternativa queda disponible si el usuario prefiere menos PRs |
| 8 | `debounceTimer` / `elementoDisparadorModalCarta` como `let` local en `actions.js` | Elevarlos a `state.js` | Un solo módulo los escribe (confirmado por el usuario) |

**Presupuesto**: diff de un pure move ≈ 2 × líneas movidas + ~15 de imports ⇒ cap de planificación **≤170 líneas movidas por PR**.

## Secuencia de PRs

| PR | Módulo / slice | Líneas ~ | Verificación en vivo |
|----|----------------|----------|----------------------|
| 1 | `state.js` (`state`, `app`) | 70 | MRC |
| 2-3 | `constants.js` (a: RAMOS_UI…OBJETOS_RIESGO_CAMPOS · b: resto + `ORDEN_FORMAS_PAGO`, `COTIZADOR_VERSION`) | 120 / 55 | MRC |
| 4-5 | `domain-rules.js` (a: helpers puros · b: `datosMinimosCompletos`, `capital*`, `formasPago*`, `puedeAvanzarADetalle`) | 140 / 140 | MRC |
| 6 | `body-builder.js` (`armarRiesgoDatos*` + `prefillDatosDesdeCotizacion`) | 169 | **MRC + Incendio + Vida-AP** |
| 7 | `render/render-campos.js` + `renderCuotasSelect`, `renderFormaPagoPills` | 89 | MRC |
| 8 | `render-cotizacion-vivo.js` (`renderLivePanel*`, `renderSublimitesFijosMrc`) | 139 | MRC (panel en vivo + sublímites) |
| 9-11 | `render-detalle-plan.js` (a: `renderFranquiciaSelect`, `renderAjuste*` · b: `renderResumenCotizacion` · c: `renderResultado*`) | 113 / 74 / 113 | **3 ramos** en 11 |
| 12-15 | `render-datos.js` (a: campos base + moneda · b: coberturas adicionales · c: `camposEspecifico*` + switch · d: `renderStepper`, `renderPlanRow`, `renderDatosView`) | 107 / 123 / 116 / 105 | **3 ramos** en 14; MRC en el resto |
| 16-17 | `render-shell.js` (a: topbar/sidebar/header/empty · b: `renderModalProgresoCarta` + `renderApp`) | 104 / 107 | MRC |
| 18-21 | `actions.js` (a: banner/aria/sync/setView/cargar* · b: `calcularPreview`+`scheduleCalculate`+líneas · c: `emitirCartaOferta`+`selectRamo`/`selectPlan` · d: `cargarParaEditar`+`init`) | 130 / 121 / 141 / 86 | MRC; **3 ramos** en 19 y 21 |
| 22 | `events.js` (+`registrarEventos()`) y `cotizar.js` bootstrap | 129 | **3 ramos**, flujo completo |

Entrega como Feature Branch Chain: PR1 contra la rama tracker, cada PR hijo contra el anterior.

## File Changes

| File | Action |
|------|--------|
| `frontend/cotizar/{state,constants,domain-rules,body-builder,actions,events}.js` | Create |
| `frontend/cotizar/render/{render-campos,render-cotizacion-vivo,render-datos,render-detalle-plan,render-shell}.js` | Create |
| `frontend/cotizar/cotizar.js` | Modify (2514 → bootstrap) |
| `frontend/cotizar/index.html` | Unchanged |

## Interfaces

Solo un símbolo cambia de forma (no de comportamiento):

```js
// events.js — los 4 listeners top-level de hoy, envueltos
export function registrarEventos() { /* click, keydown, input, change */ }
// cotizar.js
registrarEventos(); init()
```

`renderLivePanel` se mantiene exportada y llamable directo desde `actions.js` (parche de DOM fuera de `renderApp`).

## Testing Strategy

| Capa | Qué | Cómo |
|------|-----|------|
| Unit | — | No hay suite de frontend (fuera de alcance) |
| Regresión | Backend en verde | `npm test --prefix backend` por PR |
| CI | CodeQL sin `js/unvalidated-dynamic-method-call`, Prettier | GitHub Actions |
| E2E | Cero cambio observable | Playwright en vivo por PR: MRC por defecto; los 3 ramos cuando el slice toca render/armado por ramo; cero errores de consola nuevos |

## Threat Matrix

N/A — sin routing, shell, subprocesos, automatización VCS/PR, clasificación de ejecutables ni integración de procesos.

## Migration / Rollout

Sin migración. Cada PR es revertible con `git revert` del merge commit; rollback total = revertir la cadena en orden inverso.

## Open Questions

- [ ] ¿22 slices bajo presupuesto o 10 PRs con `size:exception` (ruta admin)? Decisión de entrega del usuario.
