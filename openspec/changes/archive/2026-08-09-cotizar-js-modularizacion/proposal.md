# Proposal: Modularizar `frontend/cotizar/cotizar.js`

## Intent

`frontend/cotizar/cotizar.js` concentra 2514 líneas en un solo archivo: estado, constantes, reglas de dominio, armado de payloads, acciones, render y listeners. Es el archivo más grande y más tocado del frontend (cada ajuste de MRC/Incendio/Vida-AP pasa por él), lo que encarece cada cambio, agranda el diff de review y dificulta ubicar la responsabilidad real de una función. El split de `frontend/admin/admin.js` (1621 → 337 líneas, 10 PRs, ya mergeado) probó el patrón: mismo lenguaje, mismos imports compartidos, cero regresiones. Pedido explícito en el issue #118 y en el hallazgo F1 del issue #87.

## Scope

### In Scope

- Dividir `frontend/cotizar/cotizar.js` en ~10 módulos ES por responsabilidad: `state.js`, `constants.js`, `domain-rules.js`, `body-builder.js`, `actions.js`, `events.js`, `render/render-shell.js`, `render/render-datos.js`, `render/render-cotizacion-vivo.js`, `render/render-detalle-plan.js`.
- Dejar `cotizar.js` como bootstrap delgado: imports + `registrarEventos(); init()`, misma forma que `admin.js`.
- Envolver los 4 listeners hoy registrados como sentencias top-level en un `registrarEventos()` exportado (único paso no cut-paste, ya precedentado en `admin.js`).
- Verificación 100% en vivo con Playwright sobre los ramos reales (MRC, Incendio, Vida-AP), mismo criterio que los 10 PRs de `admin-module-split`.

### Out of Scope

- Dividir `backend/src/services/cotizacion.service.js` (issue #165, queda abierto).
- Reducir duplicación de reglas de negocio frontend/backend, DTOs hacia RPC, feature flags de ramos stub (issue #165).
- Cualquier cambio de comportamiento, de UI, de contrato de API, de schema o de backend.
- Introducir tests de frontend o build step nuevo.
- Módulo `api-client.js` sugerido por #165: no aplica, los módulos importan `api`/`auth` de `../shared/api.js` directamente.

## Capabilities

### New Capabilities

None — refactor puro, sin comportamiento nuevo.

### Modified Capabilities

None — ninguna capability existente cambia de requerimiento.

## Approach

Pure move incremental, un módulo (o par de módulos) por PR, en orden del grafo de imports acíclico y unidireccional ya verificado: `state.js` (hoja) ← `constants.js` ← `domain-rules.js` ← `body-builder.js` ← `actions.js` ← `events.js` / `render/*` ← `cotizar.js` (raíz). Ningún archivo de `render/*` importa `actions.js`: el render solo emite atributos `data-action`, despachados después por `events.js`. Cada PR mueve funciones verbatim, actualiza imports y se verifica en vivo antes de mergear, igual que `admin-module-split`.

`debounceTimer` y `elementoDisparadorModalCarta` quedan como `let` local en `actions.js` (uso de un solo módulo), no se elevan a `state.js`.

## Affected Areas

| Area                                                                             | Impact    | Description                                                     |
| -------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------- |
| `frontend/cotizar/cotizar.js`                                                    | Modified  | 2514 → ~bootstrap delgado                                       |
| `frontend/cotizar/{state,constants,domain-rules,body-builder,actions,events}.js` | New       | Módulos por responsabilidad                                     |
| `frontend/cotizar/render/*.js`                                                   | New       | 4 módulos de render                                             |
| `frontend/cotizar/index.html`                                                    | Unchanged | Un solo `<script type="module">`, el grafo ES resuelve el orden |
| Backend / migraciones / specs                                                    | Unchanged | Fuera de alcance                                                |

## Risks

| Risk                                                                                       | Likelihood | Mitigation                                                                                                                                                      |
| ------------------------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CodeQL `js/unvalidated-dynamic-method-call` marca dispatchers                              | Med        | `armarRiesgoDatos` y `camposEspecificosParaRamo` se mueven verbatim como `switch`/`case` literal; NO convertir a dispatch table por objeto (precedente PR #104) |
| Sin test suite de frontend: una regresión no la atrapa CI                                  | High       | Verificación en vivo con Playwright por PR, cubriendo los branches de ramo reales                                                                               |
| Diff > 400 líneas por PR (`render-datos.js`, trío `armarRiesgoDatos*`)                     | High       | `sdd-tasks` forecast High; slicing más fino que 1 módulo = 1 PR, igual que admin (PR6/PR7 combinaron o partieron dominios)                                      |
| `renderLivePanel` se invoca directo desde `actions.js` (parche de DOM, no vía `renderApp`) | Med        | Mantener export explícito y verificar el panel en vivo tras mover `render-cotizacion-vivo.js`                                                                   |
| Ciclo de imports accidental (caso real en admin PR7)                                       | Med        | Respetar la dirección del grafo; si aparece ciclo, mover la función compartida al módulo de menor nivel                                                         |
| `codegraph_explore` roto en este proyecto (SQLite corrupto)                                | Low        | Trabajar con Read/Glob directo; `codegraph index` queda fuera de alcance                                                                                        |

## Rollback Plan

Cada PR es un pure move autocontenido y revertible con `git revert` del merge commit, sin migraciones ni estado persistido involucrado. Si una regresión aparece después de varios PRs, revertir solo el PR sospechoso: los módulos ya extraídos siguen funcionando porque el grafo de imports es acíclico y unidireccional. Rollback total = revertir la serie en orden inverso hasta volver al `cotizar.js` monolítico.

## Dependencies

- Ninguna externa. No requiere migraciones, deploy de backend ni confirmación de datos de negocio.

## Success Criteria

- [ ] `frontend/cotizar/cotizar.js` queda como bootstrap (imports + `registrarEventos(); init()`), en el orden de magnitud de los 337 líneas de `admin.js`.
- [ ] ~10 módulos nuevos, cada uno con una responsabilidad declarada, sin ciclos de imports.
- [ ] Cero cambios de comportamiento observable: mismos `data-action`, mismos payloads, mismo render.
- [ ] Suite de backend en verde en cada PR (frontend-only, no debe moverse).
- [ ] CI en verde incluyendo CodeQL (sin nuevos `js/unvalidated-dynamic-method-call`) y Prettier.
- [ ] Verificación en vivo con Playwright por PR, sin errores de consola nuevos.
- [ ] Issue #118 y hallazgo F1 del #87 cerrables; #165 sigue abierto.
