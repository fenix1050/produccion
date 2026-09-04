import assert from 'node:assert/strict'
import { test } from 'node:test'

test('proposal draft writes delegate only IDs, revision, and validated draft JSON to RPCs', async (t) => {
  const calls = []
  t.mock.module('../config/supabase.js', {
    namedExports: {
      supabase: {
        rpc: async (name, payload) => {
          calls.push({ name, payload })
          return { data: { id: 9, revision: 2 }, error: null }
        },
      },
    },
  })

  const repository = await import('./propuestas.repository.js?case=rpc-contract')
  const createPayload = { p_carta_id: 3, p_usuario_id: 5, p_es_admin: false }
  const updatePayload = {
    p_propuesta_id: 9,
    p_revision_esperada: 1,
    p_cotizacion_variante_id: 11,
    p_cotizacion_plan_pago_id: 21,
    p_draft_json: { partes: {} },
    p_usuario_id: 5,
    p_es_admin: false,
  }

  await repository.crearORecuperarBorrador(createPayload)
  await repository.actualizarBorrador(updatePayload)
  await repository.motivoIneligibilidadCarta({ cartaId: 3, usuarioId: 5, esAdmin: false })

  assert.deepEqual(calls, [
    { name: 'crear_o_recuperar_propuesta_borrador', payload: createPayload },
    { name: 'actualizar_propuesta_borrador', payload: updatePayload },
    {
      name: 'motivo_ineligibilidad_carta_propuesta',
      payload: { p_carta_id: 3, p_usuario_id: 5, p_es_admin: false },
    },
  ])
  assert.equal(JSON.stringify(calls).includes('premio_total'), false)
})
