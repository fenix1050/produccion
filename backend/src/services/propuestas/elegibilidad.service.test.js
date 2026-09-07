import assert from 'node:assert/strict'
import { test } from 'node:test'

const carta = {
  id: 7,
  numero_carta: 'MRC-7',
  producto_codigo: 'mrc',
  snapshot_json: { cotizacion: { cotizacion_variantes: [] } },
  cotizaciones: { agente_id: 4 },
}

test('Carta detail delegates eligibility to the database rule and rejects horizontal access', async (t) => {
  const calls = []
  t.mock.module('../../repositories/propuestas.repository.js', {
    namedExports: {
      findCartaContextById: async () => carta,
      motivoIneligibilidadCarta: async (payload) => {
        calls.push(payload)
        return 'CARTA_SIN_PERMISO'
      },
      findActiveDraftByCartaId: async () => null,
    },
  })
  const { obtenerCartaApta } = await import('./elegibilidad.service.js?case=ownership')

  await assert.rejects(
    obtenerCartaApta(7, { id: 5, rol: 'agente' }),
    (error) => error.status === 403
  )
  assert.deepEqual(calls, [{ cartaId: 7, usuarioId: 5, esAdmin: false }])
})

test('admin traversal and current Carta eligibility use the same database rule as listing and mutations', async (t) => {
  const calls = []
  t.mock.module('../../repositories/propuestas.repository.js', {
    namedExports: {
      findCartaContextById: async () => carta,
      motivoIneligibilidadCarta: async (payload) => {
        calls.push(payload)
        return null
      },
      findActiveDraftByCartaId: async () => null,
    },
  })
  const { obtenerCartaApta } = await import('./elegibilidad.service.js?case=admin')

  const result = await obtenerCartaApta(7, { id: 99, rol: 'admin' })
  assert.equal(result.id, 7)
  assert.deepEqual(calls, [{ cartaId: 7, usuarioId: 99, esAdmin: true }])
})
