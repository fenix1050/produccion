# Bloquear la edición de cotizaciones con Propuesta Formal emitida

## Objetivo

`PUT /cotizaciones/:id` debe responder 409 con un mensaje claro cuando la cotización ya tiene una Propuesta Formal `emitida` o `anulada`, en vez de un 500.

## Problema (probado en TEST el 2026-11-04)

`actualizar_cotizacion_atomica` (migración 082, línea ~231) hace `DELETE FROM cotizacion_variantes WHERE cotizacion_id = ...`. La FK `propuestas_formales.cotizacion_variante_id` es `ON DELETE SET NULL` (migración 069), y ese UPDATE implícito lo bloquea el trigger `proteger_propuesta_formal_emitida` (migración 071): "Los snapshots y artefactos de Propuesta Formal emitidos son inmutables" (P0001) -> 500. Reproducido con `BEGIN; DELETE ... cotizacion_id = 287; ROLLBACK;` en TEST (cotización 287 = MRC-591, Propuesta 23 emitida).

## Decisión de Kevin

Una cotización con Propuesta Formal emitida ya no puede editarse. No se anula la Propuesta automáticamente.

## Alcance autorizado

- Backend: chequeo en `backend/src/services/cotizacion-persistence.service.js` (`actualizarCotizacion`), con una función nueva en un repositorio.
- Tests del backend (incluidos los mocks de `cotizaciones.repository.js` / repositorios que usan los tests existentes).
- Fuera de alcance: frontend (deshabilitar "Editar"), migraciones, deploy.

## Modo TDD

Estricto (RED -> GREEN -> REFACTOR). Fuente: configuración global. Runner: `npm test` en `backend/`.

## Tareas

- [x] T1: test en rojo — editar una cotización con Propuesta emitida/anulada responde 409 y NO llama a `actualizarCotizacionAtomica` (RED observado: 10 pass / 2 fail)
- [x] T2: implementar chequeo + función de repositorio; GREEN (12 pass / 0 fail)
- [x] T3: ajustar mocks de tests existentes; suite backend completa en verde (`npm test`: 635 tests, 634 pass, 0 fail, 1 skipped preexistente; verificado por el parent)
- [ ] T4: registrar en `docs/ESTADO_PROYECTO.md`, PR

## Criterios de aceptación

- Cotización con Propuesta `emitida` o `anulada` -> 409 con mensaje claro, sin tocar la RPC.
- Cotización sin Propuesta, o solo con borrador -> comportamiento actual intacto.
- Suite backend en verde.

## Pendiente fuera de esta tarea

- Renombrar el botón "Carta Oferta" del historial a "Descargar Carta Oferta".
- Frontend: deshabilitar "Editar" cuando hay Propuesta emitida.

## Progreso

Rama `fix/bloquear-edicion-cotizacion-con-propuesta-emitida`. T1-T3 hechas, sin commit. Pendiente de verificación: la consulta PostgREST (`!inner` + filtro sobre la tabla embebida) está mockeada, no probada contra una base real; falta un test unitario de `existePropuestaFormalCerrada` en `cotizaciones.repository.test.js`. Próximo paso: T4 (ESTADO_PROYECTO + PR) tras decidir cómo verificar la consulta real.
