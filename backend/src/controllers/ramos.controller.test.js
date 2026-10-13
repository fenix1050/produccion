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

// QA adversarial ronda 2 (2026-10-13): un `:id` no numérico llegaba crudo a Supabase (`22P02`)
// y terminaba en 500. Se valida en el controller, antes de llamar al service.
const HANDLERS_CON_ID = [
  ['listarPlanesDeRamo', 'ramo'],
  ['listarCoberturasCatalogoDeRamo', 'ramo'],
  ['listarCoberturasDePlan', 'plan'],
  ['listarClausulasObligatoriasDePlan', 'plan'],
]
const IDS_INVALIDOS = ['abc', '0', '-1', '1.5', '', '99999999999', '1e30']

for (const [handler, sujeto] of HANDLERS_CON_ID) {
  for (const idInvalido of IDS_INVALIDOS) {
    test(`${handler}: id ${JSON.stringify(idInvalido)} responde 400 y no llama al service`, async (t) => {
      let llamado = false
      const marcar = () => {
        llamado = true
        return []
      }
      t.mock.module('../services/ramos.service.js', {
        namedExports: {
          listarPlanesDeRamo: marcar,
          listarCoberturasCatalogoDeRamo: marcar,
          listarCoberturasDePlan: marcar,
          listarClausulasObligatoriasDePlan: marcar,
        },
      })
      const controller = await import(`./ramos.controller.js?case=${handler}-${idInvalido}`)

      let errorPasadoANext
      await controller[handler]({ params: { id: idInvalido } }, crearResFake(), (err) => {
        errorPasadoANext = err
      })

      assert.equal(llamado, false)
      assert.ok(errorPasadoANext, 'debe pasar un error a next()')
      assert.equal(errorPasadoANext.status, 400)
      assert.match(errorPasadoANext.publicMessage, new RegExp(`id del ${sujeto}`))
    })
  }

  test(`${handler}: id válido llama al service con el número parseado`, async (t) => {
    let idRecibido
    const capturar = (id) => {
      idRecibido = id
      return [{ id }]
    }
    t.mock.module('../services/ramos.service.js', {
      namedExports: {
        listarPlanesDeRamo: capturar,
        listarCoberturasCatalogoDeRamo: capturar,
        listarCoberturasDePlan: capturar,
        listarClausulasObligatoriasDePlan: capturar,
      },
    })
    const controller = await import(`./ramos.controller.js?case=${handler}-valido`)

    const res = crearResFake()
    await controller[handler]({ params: { id: '3' } }, res, () => {})

    assert.equal(idRecibido, 3)
    assert.deepEqual(res.body, [{ id: 3 }])
  })
}

test('listarRubrosActividad: ramo_id gigante responde 400', async (t) => {
  t.mock.module('../services/ramos.service.js', {
    namedExports: { listarRubrosActividad: () => [] },
  })
  const { listarRubrosActividad } = await import('./ramos.controller.js?case=ramo-id-gigante')

  let errorPasadoANext
  await listarRubrosActividad({ query: { ramo_id: '99999999999' } }, crearResFake(), (err) => {
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
