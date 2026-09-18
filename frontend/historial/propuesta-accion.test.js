import assert from 'node:assert/strict'
import { test } from 'node:test'

import { decidirAccionPropuesta } from './propuesta-accion.js'

// decidirAccionPropuesta es puro (sin DOM): decide, para una fila de cartas-aptas, qué
// acción ofrecer desde Historial. Debe conservar EXACTAMENTE el literal
// `../propuestas/?carta=` en la rama "sin propuesta" (frontend/propuestas/propuestas.test.js:18
// lo asertea contra el código fuente de historial.js) y degradar al comportamiento actual
// cuando faltan los campos nuevos de la migración 075.

test('sin ninguna propuesta: Preparar propuesta hacia ../propuestas/?carta=<id>', () => {
  const carta = { id: 7, propuesta_borrador_id: null, propuesta_actual_id: null }
  const accion = decidirAccionPropuesta(carta)
  assert.equal(accion.label, 'Preparar propuesta')
  assert.equal(accion.href, '../propuestas/?carta=7')
})

test('propuesta activa (borrador): Reabrir propuesta', () => {
  const carta = {
    id: 7,
    propuesta_borrador_id: 55,
    propuesta_actual_id: 55,
    propuesta_actual_estado: 'borrador',
  }
  const accion = decidirAccionPropuesta(carta)
  assert.equal(accion.label, 'Reabrir propuesta')
  assert.equal(accion.href, '../propuestas/?propuesta=55')
})

test('propuesta emitida: Ver propuestas hacia el listado filtrado por carta', () => {
  const carta = { id: 7, propuesta_actual_id: 90, propuesta_actual_estado: 'emitida' }
  const accion = decidirAccionPropuesta(carta)
  assert.equal(accion.label, 'Ver propuestas')
  assert.equal(accion.href, '../propuestas-listado/?carta_oferta_id=7')
})

test('propuesta anulada: Ver propuestas', () => {
  const carta = { id: 7, propuesta_actual_id: 90, propuesta_actual_estado: 'anulada' }
  const accion = decidirAccionPropuesta(carta)
  assert.equal(accion.label, 'Ver propuestas')
  assert.equal(accion.href, '../propuestas-listado/?carta_oferta_id=7')
})

test('propuesta reemplazada: Ver propuestas', () => {
  const carta = { id: 7, propuesta_actual_id: 90, propuesta_actual_estado: 'reemplazada' }
  const accion = decidirAccionPropuesta(carta)
  assert.equal(accion.label, 'Ver propuestas')
  assert.equal(accion.href, '../propuestas-listado/?carta_oferta_id=7')
})

test('degradación: sin los campos de la migración 075, se comporta como antes (Preparar propuesta)', () => {
  const carta = { id: 7 } // ni propuesta_borrador_id ni los campos nuevos de 075
  const accion = decidirAccionPropuesta(carta)
  assert.equal(accion.label, 'Preparar propuesta')
  assert.equal(accion.href, '../propuestas/?carta=7')
})

test('degradación: sin campos de 075 pero con propuesta_borrador_id (comportamiento pre-075 de Reabrir)', () => {
  const carta = { id: 7, propuesta_borrador_id: 55 }
  const accion = decidirAccionPropuesta(carta)
  assert.equal(accion.label, 'Reabrir propuesta')
  assert.equal(accion.href, '../propuestas/?carta=7')
})

test('cartaApta ausente devuelve null', () => {
  assert.equal(decidirAccionPropuesta(null), null)
  assert.equal(decidirAccionPropuesta(undefined), null)
})
