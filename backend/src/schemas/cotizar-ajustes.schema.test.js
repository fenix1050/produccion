import assert from 'node:assert/strict'
import { test } from 'node:test'

import { cotizarAutoSchema } from './auto.schema.js'
import { cotizarIncendioSchema } from './incendio.schema.js'
import { cotizarMrcSchema } from './mrc.schema.js'
import { cotizarVidaApSchema } from './vida-ap.schema.js'

const schemas = [
  [
    'Auto',
    cotizarAutoSchema,
    {
      capital_asegurado: 1,
      riesgo_datos: {
        marca: 'X',
        modelo: 'Y',
        anio_fabricacion: 2020,
        destino: 'PARTICULAR',
        via_importacion: 'REPRESENTANTE',
      },
    },
  ],
  ['Incendio', cotizarIncendioSchema, { capital_asegurado: 1, riesgo_datos: {} }],
  [
    'MRC',
    cotizarMrcSchema,
    {
      capital_asegurado: 1,
      riesgo_datos: {
        cedula: '1',
        direccion: 'A',
        rubro_actividad: 'B',
        ciudad: 'C',
        capital_edificio: 1,
      },
    },
  ],
  ['Vida/AP', cotizarVidaApSchema, { capital_asegurado: 1, riesgo_datos: {} }],
]

function payload(extra = {}) {
  return { plan_id: 1, ...extra }
}

for (const [ramo, schema, fields] of schemas) {
  test(`${ramo}: allows at most 10 discounts and 10 surcharges independently`, () => {
    const adjustment = { descripcion: 'Ajuste', porcentaje: 1 }
    assert.equal(
      schema.safeParse(
        payload({
          ...fields,
          descuentos: Array(10).fill(adjustment),
          recargos: Array(10).fill(adjustment),
        })
      ).success,
      true
    )
    assert.equal(
      schema.safeParse(payload({ ...fields, descuentos: Array(11).fill(adjustment) })).success,
      false
    )
    assert.equal(
      schema.safeParse(payload({ ...fields, recargos: Array(11).fill(adjustment) })).success,
      false
    )
  })
}

test('adjustments require exactly one nonnegative amount or percentage', () => {
  const base = {
    plan_id: 1,
    capital_asegurado: 1,
    riesgo_datos: {
      marca: 'X',
      modelo: 'Y',
      anio_fabricacion: 2020,
      destino: 'PARTICULAR',
      via_importacion: 'REPRESENTANTE',
    },
  }
  const valid = (adjustment) =>
    cotizarAutoSchema.safeParse({ ...base, descuentos: [adjustment] }).success
  assert.equal(valid({ descripcion: 'Monto', monto: 5 }), true)
  assert.equal(valid({ descripcion: 'Porcentaje', porcentaje: 5 }), true)
  assert.equal(valid({ descripcion: 'Negativo', monto: -1 }), false)
  assert.equal(valid({ descripcion: 'Ambos', monto: 1, porcentaje: 1 }), false)
  assert.equal(valid({ descripcion: 'Ninguno' }), false)
})
