# Proposal: Red de seguridad de tests para la lógica de cotización (frontend)

## Intent

El issue #165 pide reducir acoplamiento y fragilidad en cotización. La exploración (2026-08-14) verificó contra código real que el hallazgo #1 (god-file `cotizar.js`) ya está resuelto por el change archivado `2026-08-09-cotizar-js-modularizacion`. Lo que sigue abierto y con evidencia concreta: reglas de negocio duplicadas FE/BE (`domain-rules.js:47` vs `incendio.calculator.js:7`; `tipo_mecanica === 'objeto_riesgo'` en 4 archivos) y **cero cobertura de tests de frontend** sobre esa lógica. Hoy un rename de plan o una mecánica nueva rompe dos ramas mantenidas por separado y nada lo atrapa antes de producción, en ramos vivos (MRC, Incendio, Vida/AP).

Este change entrega **solo el primer tramo**: la red de seguridad. Los tramos 2 y 3 se proponen como changes SDD separados por blast radius y por el presupuesto de 400 líneas.

## Scope

### In Scope

- Tests de caracterización (`node --test`, ya wired en `frontend/package.json`) de las funciones puras de `frontend/cotizar/domain-rules.js`: `planEsCalculable`, `monedaEfectiva`, `sugerenciaInspeccion`, `datosMinimosCompletos`, `puedeAvanzarADetalle`.
- Tests de caracterización de `frontend/cotizar/body-builder.js` (`armarRiesgoDatos*`, `camposEspecificosParaRamo`), cubriendo los branches de MRC, Incendio y Vida/AP.
- Documentar en los tests, como aserciones ejecutables, cada regla duplicada FE/BE detectada (nombre de plan, `tipo_mecanica`) para que el tramo 3 tenga baseline.

### Out of Scope

- **Auto individual** (Fase 1/2 pausada): `resolverTiposFranquicia`, `auto.calculator.js` — no tocar.
- Cambiar el shape del payload de `crear_cotizacion_atomica` / `actualizar_cotizacion_atomica` (migración 052).
- Trabajo en curso de Incendio (`rubro_actividad_ramo`, tasas por rubro) y RLS.
- Split de `backend/src/services/cotizacion.service.js` → change separado `cotizacion-service-split`.
- Deduplicación FE/BE vía contrato de API → change separado `cotizacion-contrato-fe-be`.
- Modularizar `actions.js` (755) / `render/render-datos.js` (637); ramos stub (ya mitigados en 2 capas).
- Cualquier cambio de comportamiento observable o de UI.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cotizar-frontend-behavior-invariant`: hoy declara explícitamente "NOT require new automated frontend tests" (verificación solo Playwright en vivo). Este change lo cambia: la lógica pura de cotización pasa a exigir cobertura automatizada.

## Approach

Test-first sobre código existente (compatible con Strict TDD Mode): se escribe el test que describe el comportamiento actual, se corre, y si falla se corrige el test — **nunca el código de producción**. Cero líneas de producción modificadas en este change. Dos PRs encadenados (domain-rules, body-builder) para respetar el presupuesto de 400 líneas.

## Affected Areas

| Area                                    | Impact    | Description                |
| --------------------------------------- | --------- | -------------------------- |
| `frontend/cotizar/domain-rules.test.js` | New       | Tests de reglas puras      |
| `frontend/cotizar/body-builder.test.js` | New       | Tests de armado de payload |
| `frontend/cotizar/*.js`                 | Unchanged | Sin cambios de producción  |
| `backend/**`                            | Unchanged | Fuera de alcance           |

## Risks

| Risk                                                  | Likelihood | Mitigation                                                             |
| ----------------------------------------------------- | ---------- | ---------------------------------------------------------------------- |
| Se "congela" un bug como comportamiento esperado      | Med        | Marcar con `// CARACTERIZACIÓN` y listar sospechas en el verify-report |
| Tests acopladas a `state.js` mutable → falsos verdes  | Med        | Solo funciones puras; resetear estado por test                         |
| Los 2 PRs superan 400 líneas                          | Med        | Encadenar; sliceable por ramo (MRC / Incendio / Vida-AP) si hace falta |
| Se contamina el diff con trabajo en curso de Incendio | Low        | Solo archivos `*.test.js` nuevos; ningún archivo compartido tocado     |

## Rollback Plan

Archivos nuevos únicamente: `git revert` del merge, o borrar los `*.test.js`. Sin migraciones, sin estado persistido, sin impacto en producción — el frontend desplegado no ejecuta tests.

## Dependencies

- Ninguna externa. `node --test` + `jsdom` ya están en el workspace `frontend`.
- Los changes `cotizacion-service-split` y `cotizacion-contrato-fe-be` dependen de que este cierre primero.

## Success Criteria

- [ ] `npm test --workspace=frontend` cubre `domain-rules.js` y `body-builder.js` para MRC, Incendio y Vida/AP.
- [ ] Cero líneas modificadas fuera de archivos `*.test.js`.
- [ ] Cada regla duplicada FE/BE identificada en la exploración tiene al menos una aserción que la fija.
- [ ] `npm run check` en verde (format, lint, backend 154/154 + frontend).
- [ ] Issue #165 actualizado: hallazgo #1 marcado obsoleto, #4 cerrado, #2 y #3 derivados a changes propios.
