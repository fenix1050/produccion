import assert from 'node:assert/strict'
import { test } from 'node:test'

function assertIsolationBreach(action, expectedDetail) {
  assert.throws(action, (error) => {
    assert.equal(error.code, 'E2E_ISOLATION_BREACH')
    assert.match(error.message, expectedDetail)
    return true
  })
}

async function fixtureAdapter() {
  const { FIXTURES } = await import('../fixtures/data.js')
  const { createFixtureAdapter } = await import('./fixture-adapter.js')
  return { FIXTURES, adapter: createFixtureAdapter(FIXTURES) }
}

test('createFixtureAdapter() preserves legacy reads and returns deep copies', async () => {
  const { FIXTURES, adapter } = await fixtureAdapter()
  assert.equal(Object.isFrozen(FIXTURES.coberturasCatalogo[10]), true)

  const user = await adapter.usuarios.findByEmail(FIXTURES.user.email)
  user.nombre = 'mutated'
  assert.equal((await adapter.usuarios.findById('1')).nombre, FIXTURES.user.nombre)
  assert.equal(typeof user.password_hash, 'string')
  assert.deepEqual(await adapter.ramos.findByCodigo('mrc'), FIXTURES.mrc.ramo)
  assert.deepEqual(await adapter.coberturas.findByRamoId(10), FIXTURES.mrc.coverages)
  assert.deepEqual(await adapter.tasas.findByRamoId(20), FIXTURES.incendio.rates)
})

test('createFixtureAdapter() resolves the composite catalog, rates, payments, and MRC sublimits', async () => {
  const { adapter } = await fixtureAdapter()
  assert.equal((await adapter.ramos.findRamoById('10')).calculador, 'mrc')
  assert.deepEqual(
    (await adapter.coberturas.findRubrosActividad(10)).map((row) => row.nombre),
    ['OFFICE', 'RETAIL']
  )
  assert.equal(
    (await adapter.coberturas.findTasasCoberturaRamo(10))[2].coberturas_catalogo.codigo,
    'sublimite_danos_agua'
  )
  assert.equal(
    (await adapter.coberturas.findTasasRiesgoObjeto(20, 'WAREHOUSE', 201)).objetos.edificio
      .tasa_valor,
    0.4
  )
  assert.deepEqual(
    (await adapter.ramos.findFormasPagoDelPlan(101)).map((row) => row.formas_pago.codigo),
    ['contado', 'cobrador', 'boca_cobranza', 'tarjeta_credito']
  )

  const sublimits = await adapter.ramos.findCoberturasByPlanId(101)
  sublimits[0].monto = 0
  assert.deepEqual(
    (await adapter.ramos.findCoberturasByPlanId(101)).map((row) => row.monto),
    [null, null, null, 2500000, 5000000, 5000000]
  )
  assert.equal(adapter.planCoberturaReads.length, 2)
})

test('createFixtureAdapter() synthesizes a monotonic persistent quote graph', async () => {
  const { adapter } = await fixtureAdapter()
  const payload = {
    p_prefijo_numero: 'MRC',
    p_ramo_id: 10,
    p_cotizacion: {
      plan_id: 101,
      agente_id: 1,
      cliente_nombre: 'Fixture',
      riesgo_datos: { rubro_actividad: 'OFFICE' },
      capital_asegurado: 150000000,
    },
    p_coberturas: [{ cobertura_id: 1001, monto: 100000000 }],
    p_variantes: [
      {
        prima: 250000,
        ajustes: [{ tipo: 'descuento', monto: 5000 }],
        planes_pago: [{ forma_pago_id: 1, premio_total: 275000 }],
      },
    ],
  }
  const firstId = await adapter.cotizaciones.crearCotizacionAtomica(payload)
  const secondId = await adapter.cotizaciones.crearCotizacionAtomica({
    ...payload,
    p_prefijo_numero: 'INCENDIO',
    p_ramo_id: 20,
  })
  assert.deepEqual([firstId, secondId], [1, 2])

  const quote = await adapter.cotizaciones.findCotizacionById(firstId)
  quote.riesgo_datos.mutated = true
  assert.equal((await adapter.cotizaciones.findById(firstId)).numero_cotizacion, 'MRC-0001')
  assert.equal((await adapter.cotizaciones.findById(firstId)).riesgo_datos.mutated, undefined)
  assert.equal(quote.cotizacion_coberturas[0].coberturas_catalogo.codigo, 'incendio_edificio')
  assert.equal(quote.cotizacion_variantes[0].cotizacion_plan_pago[0].formas_pago.codigo, 'contado')
  assert.deepEqual(await adapter.cotizaciones.findCotizaciones(), {
    data: [await adapter.cotizaciones.findById(1), await adapter.cotizaciones.findById(2)],
    count: 2,
  })
  assert.equal(adapter.quotes.length, 2)
})

test('createFixtureAdapter() fails closed for unhandled named calls', async () => {
  const { adapter } = await fixtureAdapter()
  assertIsolationBreach(
    () => adapter.cotizaciones.actualizarCotizacionAtomica({}),
    /cotizaciones\.actualizarCotizacionAtomica/
  )
  assertIsolationBreach(() => adapter.usuarios.findAll(), /usuarios\.findAll/)
  assertIsolationBreach(() => adapter.ramos.findCurvaRpf(), /ramos\.findCurvaRpf/)
})
