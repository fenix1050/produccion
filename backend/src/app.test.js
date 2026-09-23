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
