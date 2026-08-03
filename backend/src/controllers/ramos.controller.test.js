import assert from 'node:assert/strict'
import { test } from 'node:test'

// Cambio "incendio-tasas-por-rubro" (grupo 6.6): GET /ramos/rubros-actividad exige
// `ramo_id` (entero positivo) — sin él, no numérico o <=0, responde 400 y NUNCA llega
// a listarRubrosActividad (que ahora recibe un ramoId numérico, no `grupo`).

function crearResFake() {
  const res = { statusCode: 200, body: undefined }
  res.status = (codigo) => {
    res.statusCode = codigo
    return res
  }
  res.json = (payload) => {
    res.body = payload
    return res
  }
  return res
}

test('listarRubrosActividad: sin ramo_id responde 400 y no llama al service', async (t) => {
  let llamado = false
  t.mock.module('../services/ramos.service.js', {
    namedExports: {
      listarRubrosActividad: () => {
        llamado = true
        return []
      },
    },
  })
  const { listarRubrosActividad } = await import('./ramos.controller.js?case=sin-ramo-id')

  const req = { query: {} }
  const res = crearResFake()
  let errorPasadoANext
  await listarRubrosActividad(req, res, (err) => {
    errorPasadoANext = err
  })

  assert.equal(llamado, false)
  assert.ok(errorPasadoANext, 'debe pasar un error a next()')
  assert.equal(errorPasadoANext.status ?? errorPasadoANext.statusCode, 400)
})

test('listarRubrosActividad: ramo_id no numérico responde 400', async (t) => {
  t.mock.module('../services/ramos.service.js', {
    namedExports: { listarRubrosActividad: () => [] },
  })
  const { listarRubrosActividad } = await import('./ramos.controller.js?case=ramo-id-no-numerico')

  const req = { query: { ramo_id: 'abc' } }
  const res = crearResFake()
  let errorPasadoANext
  await listarRubrosActividad(req, res, (err) => {
    errorPasadoANext = err
  })

  assert.ok(errorPasadoANext)
  assert.equal(errorPasadoANext.status ?? errorPasadoANext.statusCode, 400)
})

test('listarRubrosActividad: ramo_id <= 0 responde 400', async (t) => {
  t.mock.module('../services/ramos.service.js', {
    namedExports: { listarRubrosActividad: () => [] },
  })
  const { listarRubrosActividad } = await import('./ramos.controller.js?case=ramo-id-negativo')

  const req = { query: { ramo_id: '0' } }
  const res = crearResFake()
  let errorPasadoANext
  await listarRubrosActividad(req, res, (err) => {
    errorPasadoANext = err
  })

  assert.ok(errorPasadoANext)
  assert.equal(errorPasadoANext.status ?? errorPasadoANext.statusCode, 400)
})

test('listarRubrosActividad: ramo_id válido llama al service con el número parseado', async (t) => {
  let ramoIdRecibido
  t.mock.module('../services/ramos.service.js', {
    namedExports: {
      listarRubrosActividad: (ramoId) => {
        ramoIdRecibido = ramoId
        return [{ id: 1, nombre: 'VIVIENDA' }]
      },
    },
  })
  const { listarRubrosActividad } = await import('./ramos.controller.js?case=ramo-id-valido')

  const req = { query: { ramo_id: '3' } }
  const res = crearResFake()
  await listarRubrosActividad(req, res, () => {})

  assert.equal(ramoIdRecibido, 3)
  assert.equal(res.body.length, 1)
})
