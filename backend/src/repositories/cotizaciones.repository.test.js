import assert from 'node:assert/strict'
import { test } from 'node:test'

// Cambio SDD `cotizacion-transaccional` (PR2 de 5, Phase 2 RED). Estos tests describen el
// contrato de los DOS wrappers nuevos que `cotizacion.service.js` va a llamar en vez de la
// secuencia actual de inserts/deletes (ver design.md — Interfaces/Contracts e Architecture
// Decisions #4/#5): `crearCotizacionAtomica(payload)` y `actualizarCotizacionAtomica(payload)`,
// cada uno un thin wrapper de UN solo `supabase.rpc(...)` contra las funciones plpgsql ya
// aplicadas en Supabase real por la migración `052_cotizacion_atomica_rpc.sql` (PR1, ya
// mergeada a `main`).
//
// NO existen todavía en `cotizaciones.repository.js` — este archivo debe fallar (RED) contra el
// código actual. La implementación real es tarea de Phase 3 (PR3), no de este PR.
//
// Mismo patrón de mock de Supabase (builder mínimo para `.from()`, más un stub de `.rpc()`) que
// `ramos.repository.test.js` / `coberturas.repository.test.js`.
function mockearSupabaseRpc(t, respuesta) {
  const llamadas = []
  t.mock.module('../config/supabase.js', {
    namedExports: {
      supabase: {
        rpc: (nombreFuncion, params) => {
          llamadas.push({ nombreFuncion, params })
          return Promise.resolve(respuesta)
        },
      },
    },
  })
  return llamadas
}

test('crearCotizacionAtomica: llama a supabase.rpc("crear_cotizacion_atomica", payload) con el payload p_* exacto', async (t) => {
  const llamadas = mockearSupabaseRpc(t, { data: 123, error: null })

  const { crearCotizacionAtomica } = await import(
    './cotizaciones.repository.js?case=crear-atomica-payload'
  )

  const payload = {
    p_prefijo_numero: 'MRC',
    p_ramo_id: 2,
    p_cotizacion: {
      plan_id: 20,
      agente_id: 1,
      cliente_nombre: 'Cliente Test',
      cliente_contacto: null,
      riesgo_datos: { rubro_actividad: 'Bazar' },
      capital_asegurado: 0,
      estado: 'cotizada',
      moneda: 'PYG',
    },
    p_coberturas: [],
    p_variantes: [
      {
        tipo_franquicia: 'sin_franquicia',
        franquicia_monto: 0,
        prima: 29_500,
        ajustes: [],
        planes_pago: [
          {
            forma_pago_id: 1,
            cantidad_cuotas: 0,
            rpf_porcentaje: 0,
            rpf_monto: 0,
            iva_monto: 2_950,
            premio_total: 32_450,
            monto_inicial: 32_450,
            monto_cuota: 0,
          },
        ],
      },
    ],
  }

  const cotizacionId = await crearCotizacionAtomica(payload)

  assert.equal(cotizacionId, 123, 'debe devolver el cotizacion_id que retorna el RPC')
  assert.equal(llamadas.length, 1, 'un único call a supabase.rpc — no inserts secuenciales')
  assert.equal(llamadas[0].nombreFuncion, 'crear_cotizacion_atomica')
  assert.deepEqual(
    llamadas[0].params,
    payload,
    'el wrapper debe reenviar el payload tal cual, sin transformarlo — las keys p_* ya vienen armadas por el servicio'
  )
})

test('crearCotizacionAtomica: propaga el error del RPC sin envolverlo (rollback lo maneja Postgres, no JS)', async (t) => {
  const errorPostgres = new Error(
    'insert or update on table "cotizacion_plan_pago" violates foreign key constraint'
  )
  mockearSupabaseRpc(t, { data: null, error: errorPostgres })

  const { crearCotizacionAtomica } = await import(
    './cotizaciones.repository.js?case=crear-atomica-error'
  )

  await assert.rejects(
    () =>
      crearCotizacionAtomica({
        p_prefijo_numero: 'MRC',
        p_ramo_id: 2,
        p_cotizacion: {},
        p_coberturas: [],
        p_variantes: [],
      }),
    errorPostgres
  )
})

test('actualizarCotizacionAtomica: llama a supabase.rpc("actualizar_cotizacion_atomica", payload) con el payload p_* exacto', async (t) => {
  const llamadas = mockearSupabaseRpc(t, { data: 5, error: null })

  const { actualizarCotizacionAtomica } = await import(
    './cotizaciones.repository.js?case=actualizar-atomica-payload'
  )

  const payload = {
    p_cotizacion_id: 5,
    p_cotizacion: {
      cliente_nombre: 'Cliente Test',
      cliente_contacto: null,
      riesgo_datos: { rubro_actividad: 'VIVIENDA FAMILIAR' },
      capital_asegurado: 0,
      plan_id: 10,
      estado: 'cotizada',
      moneda: 'USD',
      tipo_cambio_snapshot: 7300.75,
      tipo_cambio_fuente: 'dolarpy:set',
      tipo_cambio_fecha: '2026-07-27T00:00:00Z',
    },
    p_coberturas: [],
    p_variantes: [],
  }

  const cotizacionId = await actualizarCotizacionAtomica(payload)

  assert.equal(cotizacionId, 5)
  assert.equal(llamadas.length, 1, 'un único call a supabase.rpc — no delete-then-insert')
  assert.equal(llamadas[0].nombreFuncion, 'actualizar_cotizacion_atomica')
  assert.deepEqual(llamadas[0].params, payload)
})

test('actualizarCotizacionAtomica: propaga el error del RPC sin envolverlo (estado previo queda 100% intacto)', async (t) => {
  const errorPostgres = new Error('cotización no encontrada para actualizar')
  mockearSupabaseRpc(t, { data: null, error: errorPostgres })

  const { actualizarCotizacionAtomica } = await import(
    './cotizaciones.repository.js?case=actualizar-atomica-error'
  )

  await assert.rejects(
    () =>
      actualizarCotizacionAtomica({
        p_cotizacion_id: 999,
        p_cotizacion: {},
        p_coberturas: [],
        p_variantes: [],
      }),
    errorPostgres
  )
})
