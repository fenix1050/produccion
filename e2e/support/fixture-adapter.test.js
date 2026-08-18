import assert from 'node:assert/strict'
import { test } from 'node:test'

function assertIsolationBreach(action, expectedDetail) {
  assert.throws(action, (error) => {
    assert.equal(error.code, 'E2E_ISOLATION_BREACH')
    assert.match(error.message, expectedDetail)
    return true
  })
}

test('createFixtureAdapter() provides frozen deterministic MRC and Incendio data as deep copies', async () => {
  const { FIXTURES } = await import('../fixtures/data.js')
  const { createFixtureAdapter } = await import('./fixture-adapter.js')
  const adapter = createFixtureAdapter(FIXTURES)

  assert.equal(Object.isFrozen(FIXTURES), true)
  assert.equal(Object.isFrozen(FIXTURES.mrc), true)
  assert.equal(Object.isFrozen(FIXTURES.incendio), true)

  const firstUser = await adapter.usuarios.findByEmail(FIXTURES.user.email)
  firstUser.nombre = 'Mutated fixture user'
  const secondUser = await adapter.usuarios.findByEmail(FIXTURES.user.email)

  assert.equal(secondUser.nombre, FIXTURES.user.nombre)
  assert.notStrictEqual(firstUser, secondUser)
  assert.deepEqual(await adapter.ramos.findByCodigo('mrc'), {
    id: FIXTURES.mrc.ramo.id,
    codigo: 'mrc',
    nombre: 'Multirriesgo Comercio',
    activo: true,
  })
  assert.deepEqual(await adapter.ramos.findByCodigo('incendio'), {
    id: FIXTURES.incendio.ramo.id,
    codigo: 'incendio',
    nombre: 'Incendio',
    activo: true,
  })
})

test('createFixtureAdapter() assigns monotonic quote IDs and fails closed for unhandled named calls', async () => {
  const { FIXTURES } = await import('../fixtures/data.js')
  const { createFixtureAdapter } = await import('./fixture-adapter.js')
  const adapter = createFixtureAdapter(FIXTURES)

  const firstQuote = await adapter.cotizaciones.crearCotizacionAtomica({
    ramo_id: FIXTURES.mrc.ramo.id,
  })
  firstQuote.riesgo_datos.mutated = true
  const secondQuote = await adapter.cotizaciones.crearCotizacionAtomica({
    ramo_id: FIXTURES.incendio.ramo.id,
  })

  assert.deepEqual(await adapter.cotizaciones.findById(firstQuote.id), {
    id: 1,
    ramo_id: FIXTURES.mrc.ramo.id,
    riesgo_datos: {},
  })
  assert.deepEqual(secondQuote, { id: 2, ramo_id: FIXTURES.incendio.ramo.id, riesgo_datos: {} })
  assertIsolationBreach(
    () => adapter.cotizaciones.deleteOutsideFixtureBoundary(1),
    /cotizaciones\.deleteOutsideFixtureBoundary/
  )
  assertIsolationBreach(() => adapter.usuarios.findAll(), /usuarios\.findAll/)
})
