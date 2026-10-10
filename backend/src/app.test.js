import assert from 'node:assert/strict'
import { test } from 'node:test'

import { manejarErrorCentral } from './app.js'
import { httpError } from './utils/http-error.js'

function crearResFake() {
  const res = { statusCode: 200, body: undefined }
  res.status = (codigo) => {
    res.statusCode = codigo
    return res
  }
  res.json = (payload) => {
    // Espejo de express.json(): serializa a JSON de verdad, así una key en `undefined`
    // desaparece igual que en una respuesta HTTP real (JSON no tiene `undefined`).
    res.body = JSON.parse(JSON.stringify(payload))
    return res
  }
  return res
}

test('manejarErrorCentral expone codigo cuando el error trae uno de negocio', () => {
  const err = httpError(409, 'El borrador ya no admite cambios')
  err.code = 'PF_BORRADOR_NO_EDITABLE'
  const res = crearResFake()

  manejarErrorCentral(err, {}, res, () => {})

  assert.equal(res.statusCode, 409)
  assert.deepEqual(res.body, {
    error: 'El borrador ya no admite cambios',
    codigo: 'PF_BORRADOR_NO_EDITABLE',
  })
})

test('manejarErrorCentral omite codigo (no lo inventa) cuando el error no trae uno', () => {
  const err = httpError(500, 'Error interno del servidor')
  const res = crearResFake()

  manejarErrorCentral(err, {}, res, () => {})

  assert.equal(res.statusCode, 500)
  assert.deepEqual(res.body, { error: 'Error interno del servidor' })
  assert.ok(!('codigo' in res.body))
})

// QA adversarial 2026-10-01: los errores crudos de PostgREST/Postgres salían como
// `{"error":"Error interno del servidor","codigo":"22P02"}` y filtraban el SQLSTATE al cliente.
test('manejarErrorCentral no expone el SQLSTATE de Postgres en un 500', () => {
  const err = Object.assign(new Error('invalid input syntax for type bigint'), { code: '22P02' })
  const res = crearResFake()

  manejarErrorCentral(err, {}, res, () => {})

  assert.equal(res.statusCode, 500)
  assert.deepEqual(res.body, { error: 'Error interno del servidor' })
})

test('manejarErrorCentral no expone códigos PGRST ni de sistema (ECONNRESET)', () => {
  for (const code of ['PGRST116', 'PGRST301', 'ECONNRESET', '23514']) {
    const err = Object.assign(new Error('falla interna'), { code })
    const res = crearResFake()

    manejarErrorCentral(err, {}, res, () => {})

    assert.ok(!('codigo' in res.body), `no debería exponer ${code}`)
  }
})

test('manejarErrorCentral conserva los códigos propios PF_ y CARTA_ también en un 5xx', () => {
  for (const code of ['PF_PDF_FIT_FAILED', 'CARTA_OFERTA_SNAPSHOT_OBSOLETO']) {
    const err = httpError(500, 'No se pudo generar el PDF')
    err.code = code
    const res = crearResFake()

    manejarErrorCentral(err, {}, res, () => {})

    assert.equal(res.body.codigo, code)
  }
})

test('manejarErrorCentral loguea code, details y hint del error para no perder observabilidad', (t) => {
  const registro = t.mock.method(console, 'error', () => {})
  const err = Object.assign(new Error('violates check constraint'), {
    code: '23514',
    details: 'Failing row contains (1, ...)',
    hint: 'revisar el tamaño del draft',
  })

  manejarErrorCentral(err, {}, crearResFake(), () => {})

  const logueado = JSON.stringify(registro.mock.calls.map((llamada) => llamada.arguments))
  assert.match(logueado, /23514/)
  assert.match(logueado, /Failing row contains/)
  assert.match(logueado, /revisar el tamaño del draft/)
})
