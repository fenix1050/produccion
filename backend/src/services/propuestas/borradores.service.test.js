import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

const carta = {
  id: 7,
  numero_carta: 'MRC-7',
  estado: 'emitida',
  producto_codigo: 'mrc',
  pdf_storage_path: '7/v1.pdf',
  pdf_hash: 'a'.repeat(64),
  snapshot_hash: 'b'.repeat(64),
  snapshot_json: { cotizacion: { cliente_nombre: 'Cliente' } },
  cotizaciones: { agente_id: 4, fecha: '2026-08-01', vigencia_dias: 90 },
}

const repositoryState = {
  actualizarBorrador: async () => null,
  findCartaContextById: async () => carta,
  findPropuestaContextById: async () => null,
  motivoIneligibilidadCarta: async () => null,
}

mock.module('../../repositories/propuestas.repository.js', {
  namedExports: {
    actualizarBorrador: (...args) => repositoryState.actualizarBorrador(...args),
    findCartaContextById: (...args) => repositoryState.findCartaContextById(...args),
    findPropuestaContextById: (...args) => repositoryState.findPropuestaContextById(...args),
    motivoIneligibilidadCarta: (...args) => repositoryState.motivoIneligibilidadCarta(...args),
  },
})

const { actualizarBorrador, obtenerBorrador, traducirErrorRpc } =
  await import('./borradores.service.js')

test('draft update forwards selection IDs and expected revision without accepting monetary authority', async () => {
  let payload
  repositoryState.actualizarBorrador = async (value) => {
    payload = value
    return {
      id: 8,
      carta_oferta_id: 7,
      revision: 4,
      cotizacion_variante_id: 10,
      cotizacion_plan_pago_id: 20,
      draft_json: value.p_draft_json,
    }
  }
  repositoryState.findCartaContextById = async () => carta
  repositoryState.motivoIneligibilidadCarta = async () => null
  const input = {
    revision: 3,
    cotizacion_variante_id: 10,
    cotizacion_plan_pago_id: 20,
    draft_json: { partes: { asegurado: { nombre_razon_social: 'Cliente' } } },
  }

  const result = await actualizarBorrador(8, input, { id: 4, rol: 'agente' })

  assert.deepEqual(payload, {
    p_propuesta_id: 8,
    p_revision_esperada: 3,
    p_cotizacion_variante_id: 10,
    p_cotizacion_plan_pago_id: 20,
    p_draft_json: input.draft_json,
    p_usuario_id: 4,
    p_es_admin: false,
  })
  assert.equal(result.revision, 4)
  assert.equal(JSON.stringify(payload).includes('premio_total'), false)
})

test('stale revision becomes an HTTP 409 conflict', async () => {
  repositoryState.actualizarBorrador = async () => {
    throw new Error('PF_REVISION_CONFLICT')
  }

  await assert.rejects(
    actualizarBorrador(
      8,
      {
        revision: 2,
        cotizacion_variante_id: null,
        cotizacion_plan_pago_id: null,
        draft_json: {},
      },
      { id: 4, rol: 'agente' }
    ),
    (error) => error.status === 409 && error.code === 'PF_REVISION_CONFLICT'
  )
})

test('emitted-Carta domain and native unique conflicts share the HTTP 409 API contract', () => {
  for (const source of [
    Object.assign(new Error('PF_CARTA_YA_TIENE_PROPUESTA_EMITIDA'), { code: 'P0001' }),
    Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' }),
  ]) {
    const error = traducirErrorRpc(source)
    assert.equal(error.status, 409)
    assert.equal(error.code, 'PF_CARTA_YA_TIENE_PROPUESTA_EMITIDA')
    assert.equal(error.publicMessage, 'La Carta Oferta ya tiene una Propuesta Formal emitida')
  }
})

test('getting a draft enforces Carta ownership while allowing admin transversal access', async () => {
  repositoryState.findPropuestaContextById = async () => ({
    id: 8,
    revision: 1,
    draft_json: {},
    cartas_oferta: carta,
  })
  repositoryState.motivoIneligibilidadCarta = async ({ usuarioId, esAdmin }) =>
    esAdmin || usuarioId === carta.cotizaciones.agente_id ? null : 'CARTA_SIN_PERMISO'

  await assert.rejects(
    obtenerBorrador(8, { id: 5, rol: 'agente' }),
    (error) => error.status === 403
  )
  const result = await obtenerBorrador(8, { id: 99, rol: 'admin' })
  assert.equal(result.id, 8)
  assert.equal(result.carta_detalle.id, carta.id)
})
