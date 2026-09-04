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

test('annulled proposal context includes its emitted replacement without changing either proposal', async (t) => {
  const calls = []
  const original = { id: 9, estado: 'anulada', cartas_oferta: { id: 3 } }
  const replacement = { id: 10, numero_propuesta: 42, estado: 'emitida' }
  t.mock.module('../config/supabase.js', {
    namedExports: {
      supabase: {
        from: (table) => {
          calls.push({ table })
          const query = {
            select: (columns) => {
              calls[calls.length - 1].columns = columns
              return query
            },
            eq: (column, value) => {
              ;(calls[calls.length - 1].filters ??= []).push([column, value])
              return query
            },
            single: async () => ({ data: original, error: null }),
            maybeSingle: async () => ({ data: replacement, error: null }),
          }
          return query
        },
      },
    },
  })

  const repository = await import('./propuestas.repository.js?case=replacement-context')
  const result = await repository.findPropuestaContextById(9)

  assert.deepEqual(result.reemplazada_por_propuesta, replacement)
  assert.deepEqual(calls, [
    {
      table: 'propuestas_formales',
      columns: '*, cartas_oferta(*, cotizaciones(*))',
      filters: [['id', 9]],
    },
    {
      table: 'propuestas_formales',
      columns: 'id, numero_propuesta, estado',
      filters: [
        ['reemplaza_propuesta_id', 9],
        ['estado', 'emitida'],
      ],
    },
  ])
  assert.deepEqual(original, { id: 9, estado: 'anulada', cartas_oferta: { id: 3 } })
  assert.deepEqual(replacement, { id: 10, numero_propuesta: 42, estado: 'emitida' })
})
