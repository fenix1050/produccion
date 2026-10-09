import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { cotizarMrcSchema } from './mrc.schema.js'

function body(riesgoExtra = {}, raizExtra = {}) {
  return {
    plan_id: 1,
    capital_asegurado: 1,
    riesgo_datos: {
      cedula: '1',
      direccion: 'A',
      rubro_actividad: 'B',
      ciudad: 'C',
      capital_edificio: 1_000_000,
      ...riesgoExtra,
    },
    ...raizExtra,
  }
}

const MONTOS_INVALIDOS = [1e308, Infinity, 1e12, 999_999_999_999.5]

describe('mrc.schema — topes de sanidad en montos', () => {
  test('acepta el monto máximo permitido (999.999.999.999)', () => {
    const r = cotizarMrcSchema.safeParse(
      body(
        {
          capital_contenido: 999_999_999_999,
          coberturas_adicionales: [{ codigo: 'x', suma_asegurada: 999_999_999_999 }],
        },
        { capital_asegurado: 999_999_999_999 }
      )
    )
    assert.equal(r.success, true)
  })

  for (const monto of MONTOS_INVALIDOS) {
    test(`rechaza ${monto} en suma_asegurada de coberturas adicionales`, () => {
      const r = cotizarMrcSchema.safeParse(
        body({ coberturas_adicionales: [{ codigo: 'x', suma_asegurada: monto }] })
      )
      assert.equal(r.success, false)
      assert.match(r.error.issues[0].message, /suma asegurada de la cobertura adicional/i)
    })

    test(`rechaza ${monto} en capital_edificio`, () => {
      const r = cotizarMrcSchema.safeParse(body({ capital_edificio: monto }))
      assert.equal(r.success, false)
      assert.match(r.error.issues[0].message, /capital de edificio/i)
    })

    test(`rechaza ${monto} en capital_contenido`, () => {
      const r = cotizarMrcSchema.safeParse(body({ capital_contenido: monto }))
      assert.equal(r.success, false)
      assert.match(r.error.issues[0].message, /capital de contenido/i)
    })

    test(`rechaza ${monto} en capital_asegurado`, () => {
      const r = cotizarMrcSchema.safeParse(body({}, { capital_asegurado: monto }))
      assert.equal(r.success, false)
      assert.match(r.error.issues[0].message, /capital asegurado/i)
    })
  }
})
