import assert from 'node:assert/strict'
import { test } from 'node:test'

// Cambio "incendio-tasas-por-rubro" (grupo 6.6): GET /admin/rubros-actividad comparte
// el mismo contrato y validación que GET /ramos/rubros-actividad — un solo mecanismo de
// filtrado (`ramo_id`), el parámetro legacy `grupo` deja de interpretarse acá también.
// Archivo separado (no admin.controller.test.js) para no acoplar este test a mockear
// TODOS los servicios que admin.controller.js importa.

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

test('admin listarRubrosActividad: sin ramo_id responde 400 y no llama al service', async (t) => {
  let llamado = false
  t.mock.module('../services/admin/rubros-actividad.service.js', {
    exports: {
      listarRubrosActividad: () => {
        llamado = true
        return []
      },
      editarRubroActividad: () => null,
    },
  })
  const { listarRubrosActividad } = await import('./admin.controller.js?case=admin-sin-ramo-id')

  const req = { query: {} }
  const res = crearResFake()
  let errorPasadoANext
  await listarRubrosActividad(req, res, (err) => {
    errorPasadoANext = err
  })

  assert.equal(llamado, false)
  assert.ok(errorPasadoANext)
  assert.equal(errorPasadoANext.status ?? errorPasadoANext.statusCode, 400)
})

test('admin listarRubrosActividad: ramo_id=abc responde 400', async (t) => {
  t.mock.module('../services/admin/rubros-actividad.service.js', {
    exports: { listarRubrosActividad: () => [], editarRubroActividad: () => null },
  })
  const { listarRubrosActividad } = await import('./admin.controller.js?case=admin-ramo-id-abc')

  const req = { query: { ramo_id: 'abc' } }
  const res = crearResFake()
  let errorPasadoANext
  await listarRubrosActividad(req, res, (err) => {
    errorPasadoANext = err
  })

  assert.ok(errorPasadoANext)
  assert.equal(errorPasadoANext.status ?? errorPasadoANext.statusCode, 400)
})

test('admin listarRubrosActividad: ramo_id<=0 responde 400', async (t) => {
  t.mock.module('../services/admin/rubros-actividad.service.js', {
    exports: { listarRubrosActividad: () => [], editarRubroActividad: () => null },
  })
  const { listarRubrosActividad } =
    await import('./admin.controller.js?case=admin-ramo-id-negativo')

  const req = { query: { ramo_id: '-1' } }
  const res = crearResFake()
  let errorPasadoANext
  await listarRubrosActividad(req, res, (err) => {
    errorPasadoANext = err
  })

  assert.ok(errorPasadoANext)
  assert.equal(errorPasadoANext.status ?? errorPasadoANext.statusCode, 400)
})

test('admin listarRubrosActividad: ramo_id válido llama al service con el número parseado', async (t) => {
  let ramoIdRecibido
  t.mock.module('../services/admin/rubros-actividad.service.js', {
    exports: {
      listarRubrosActividad: (ramoId) => {
        ramoIdRecibido = ramoId
        return [{ id: 1, nombre: 'VIVIENDA' }]
      },
      editarRubroActividad: () => null,
    },
  })
  const { listarRubrosActividad } = await import('./admin.controller.js?case=admin-ramo-id-valido')

  const req = { query: { ramo_id: '3' } }
  const res = crearResFake()
  await listarRubrosActividad(req, res, () => {})

  assert.equal(ramoIdRecibido, 3)
  assert.equal(res.body.length, 1)
})
