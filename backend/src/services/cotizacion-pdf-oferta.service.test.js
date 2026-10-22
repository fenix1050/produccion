import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

const USUARIO = { id: 'u-1', rol: 'admin' }
const COTIZACION = { id: 10, plan_id: 7, ramo_id: 3, agente_id: 'u-1' }
const SIN_FILAS = Object.assign(
  new Error('JSON object requested, multiple (or no) rows returned'),
  {
    code: 'PGRST116',
  }
)

function mockear(t, { findPlanById, findRamoById }) {
  t.mock.module('../repositories/cotizaciones.repository.js', {
    namedExports: { findCotizacionById: async () => COTIZACION },
  })
  t.mock.module('../repositories/ramos.repository.js', {
    namedExports: {
      findPlanById,
      findRamoById,
      findCoberturasByPlanId: async () => [],
    },
  })
  t.mock.module('./carta-oferta.service.js', {
    namedExports: { generarCartaOfertaPersistida: async () => Buffer.from('pdf') },
  })
}

describe('generarPdfOferta — plan o ramo inexistente', () => {
  test('plan inexistente (PGRST116) responde 404 "Plan no encontrado", no un 500 crudo', async (t) => {
    mockear(t, {
      findPlanById: async () => {
        throw SIN_FILAS
      },
      findRamoById: async () => ({ id: 3 }),
    })
    const { generarPdfOferta } = await import('./cotizacion.service.js?case=pdf-plan-404')

    await assert.rejects(
      () => generarPdfOferta(10, USUARIO),
      (error) => error.status === 404 && error.publicMessage === 'Plan no encontrado'
    )
  })

  test('ramo inexistente (PGRST116) responde 404 "Ramo no encontrado"', async (t) => {
    mockear(t, {
      findPlanById: async () => ({ id: 7, ramo_id: 3 }),
      findRamoById: async () => {
        throw SIN_FILAS
      },
    })
    const { generarPdfOferta } = await import('./cotizacion.service.js?case=pdf-ramo-404')

    await assert.rejects(
      () => generarPdfOferta(10, USUARIO),
      (error) => error.status === 404 && error.publicMessage === 'Ramo no encontrado'
    )
  })

  test('un error que no es "sin filas" se propaga intacto', async (t) => {
    const caida = Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' })
    mockear(t, {
      findPlanById: async () => {
        throw caida
      },
      findRamoById: async () => ({ id: 3 }),
    })
    const { generarPdfOferta } = await import('./cotizacion.service.js?case=pdf-error-otro')

    await assert.rejects(() => generarPdfOferta(10, USUARIO), caida)
  })
})
