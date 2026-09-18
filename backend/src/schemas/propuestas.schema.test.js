import assert from 'node:assert/strict'
import { test } from 'node:test'

import { listarPropuestasQuerySchema } from './propuestas.schema.js'

test('listarPropuestasQuerySchema: defaults limit=20 and offset=0 when omitted', () => {
  const result = listarPropuestasQuerySchema.parse({})
  assert.equal(result.limit, 20)
  assert.equal(result.offset, 0)
})

test('listarPropuestasQuerySchema: rejects limit=0', () => {
  const result = listarPropuestasQuerySchema.safeParse({ limit: 0 })
  assert.equal(result.success, false)
})

test('listarPropuestasQuerySchema: rejects limit=101', () => {
  const result = listarPropuestasQuerySchema.safeParse({ limit: 101 })
  assert.equal(result.success, false)
})

test('listarPropuestasQuerySchema: accepts limit=100 (upper bound)', () => {
  const result = listarPropuestasQuerySchema.safeParse({ limit: 100 })
  assert.equal(result.success, true)
  assert.equal(result.data.limit, 100)
})

test('listarPropuestasQuerySchema: rejects invalid estado', () => {
  const result = listarPropuestasQuerySchema.safeParse({ estado: 'no-existe' })
  assert.equal(result.success, false)
})

test('listarPropuestasQuerySchema: accepts estado=activa (synthetic state)', () => {
  const result = listarPropuestasQuerySchema.safeParse({ estado: 'activa' })
  assert.equal(result.success, true)
  assert.equal(result.data.estado, 'activa')
})

test('listarPropuestasQuerySchema: accepts each of the 7 real estado values', () => {
  const estados = [
    'borrador',
    'en_revision',
    'generando_pdf',
    'emitida',
    'error_pdf',
    'reemplazada',
    'anulada',
  ]
  for (const estado of estados) {
    const result = listarPropuestasQuerySchema.safeParse({ estado })
    assert.equal(result.success, true, `estado=${estado} should be valid`)
  }
})

test('listarPropuestasQuerySchema: rejects negative offset', () => {
  const result = listarPropuestasQuerySchema.safeParse({ offset: -1 })
  assert.equal(result.success, false)
})

test('listarPropuestasQuerySchema: coerces carta_oferta_id from query string and rejects non-positive', () => {
  const ok = listarPropuestasQuerySchema.safeParse({ carta_oferta_id: '7' })
  assert.equal(ok.success, true)
  assert.equal(ok.data.carta_oferta_id, 7)

  const bad = listarPropuestasQuerySchema.safeParse({ carta_oferta_id: '0' })
  assert.equal(bad.success, false)
})

test('listarPropuestasQuerySchema: busqueda is optional and trimmed', () => {
  const result = listarPropuestasQuerySchema.safeParse({ busqueda: '  cliente  ' })
  assert.equal(result.success, true)
  assert.equal(result.data.busqueda, 'cliente')
})
