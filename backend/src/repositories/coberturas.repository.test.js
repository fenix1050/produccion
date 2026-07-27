import assert from 'node:assert/strict'
import { test } from 'node:test'

// Unit test de `findTasasRiesgoObjeto` (grupo 5.1 de "incendio-3-planes-y-moneda"): resolución
// de cabecera (tipos_riesgo_incendio) + detalle (tasas_riesgo_objeto) con override por plan_id
// ganando sobre la fila genérica (plan_id IS NULL), sin importar el orden en que Supabase
// devuelva las filas. `supabase` mockeado con un builder mínimo, thenable, que ignora los
// filtros reales (los fixtures ya vienen pre-filtrados por tabla) — alcanza para probar la
// lógica de merge que vive en el repository, no la query en sí.
function mockearSupabase(t, respuestasPorTabla) {
  t.mock.module('../config/supabase.js', {
    exports: {
      supabase: {
        from(tabla) {
          const respuesta = respuestasPorTabla[tabla] ?? { data: null, error: null }
          const builder = {
            select: () => builder,
            eq: () => builder,
            or: () => builder,
            maybeSingle: () => Promise.resolve(respuesta),
            then: (resolve, reject) => Promise.resolve(respuesta).then(resolve, reject),
          }
          return builder
        },
      },
    },
  })
}

const TIPO_RIESGO_VIVIENDA_FAMILIAR = {
  data: {
    id: 5,
    nombre: 'VIVIENDA FAMILIAR',
    tasa_global: 2.24,
    tasa_minima: 0.6,
    tasa_maxima: 35.48,
    unidad: 'porcentaje',
  },
  error: null,
}

test('findTasasRiesgoObjeto: el override de plan_id gana sobre la fila genérica (generica primero)', async (t) => {
  mockearSupabase(t, {
    tipos_riesgo_incendio: TIPO_RIESGO_VIVIENDA_FAMILIAR,
    tasas_riesgo_objeto: {
      data: [
        { objeto_riesgo: 'edificio', tasa_valor: 0.9, unidad: 'porcentaje', plan_id: null },
        { objeto_riesgo: 'edificio', tasa_valor: 0.5, unidad: 'porcentaje', plan_id: 42 },
      ],
      error: null,
    },
  })

  const { findTasasRiesgoObjeto } =
    await import('./coberturas.repository.js?case=override-generica-primero')
  const resultado = await findTasasRiesgoObjeto(1, 'VIVIENDA FAMILIAR', 42)

  assert.equal(resultado.objetos.edificio.tasa_valor, 0.5)
})

test('findTasasRiesgoObjeto: el override de plan_id gana sobre la genérica (override primero, orden no importa)', async (t) => {
  mockearSupabase(t, {
    tipos_riesgo_incendio: TIPO_RIESGO_VIVIENDA_FAMILIAR,
    tasas_riesgo_objeto: {
      data: [
        { objeto_riesgo: 'edificio', tasa_valor: 0.5, unidad: 'porcentaje', plan_id: 42 },
        { objeto_riesgo: 'edificio', tasa_valor: 0.9, unidad: 'porcentaje', plan_id: null },
      ],
      error: null,
    },
  })

  const { findTasasRiesgoObjeto } = await import('./coberturas.repository.js?case=override-primero')
  const resultado = await findTasasRiesgoObjeto(1, 'VIVIENDA FAMILIAR', 42)

  assert.equal(resultado.objetos.edificio.tasa_valor, 0.5)
})

test('findTasasRiesgoObjeto: sin fila genérica, un override de OTRO plan no aplica al plan consultado', async (t) => {
  mockearSupabase(t, {
    tipos_riesgo_incendio: TIPO_RIESGO_VIVIENDA_FAMILIAR,
    tasas_riesgo_objeto: {
      // Supabase ya filtró con `.or('plan_id.is.null,plan_id.eq.99')` — un override de OTRO plan
      // (42) nunca llegaría en la respuesta real; se simula acá solo la fila que SÍ llegaría.
      data: [{ objeto_riesgo: 'edificio', tasa_valor: 0.9, unidad: 'porcentaje', plan_id: null }],
      error: null,
    },
  })

  const { findTasasRiesgoObjeto } = await import('./coberturas.repository.js?case=sin-override')
  const resultado = await findTasasRiesgoObjeto(1, 'VIVIENDA FAMILIAR', 99)

  assert.equal(resultado.objetos.edificio.tasa_valor, 0.9)
})

test('findTasasRiesgoObjeto: tipo de riesgo inexistente devuelve null', async (t) => {
  mockearSupabase(t, {
    tipos_riesgo_incendio: { data: null, error: null },
  })

  const { findTasasRiesgoObjeto } =
    await import('./coberturas.repository.js?case=tipo-riesgo-inexistente')
  const resultado = await findTasasRiesgoObjeto(1, 'RUBRO INEXISTENTE', 1)

  assert.equal(resultado, null)
})

test('findTasasRiesgoObjeto: tipo de riesgo existe pero sin ninguna tasa confirmada devuelve null', async (t) => {
  mockearSupabase(t, {
    tipos_riesgo_incendio: TIPO_RIESGO_VIVIENDA_FAMILIAR,
    tasas_riesgo_objeto: { data: [], error: null },
  })

  const { findTasasRiesgoObjeto } =
    await import('./coberturas.repository.js?case=sin-tasas-confirmadas')
  const resultado = await findTasasRiesgoObjeto(1, 'VIVIENDA FAMILIAR', 1)

  assert.equal(resultado, null)
})
