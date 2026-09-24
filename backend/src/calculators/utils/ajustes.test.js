import assert from 'node:assert/strict'
import { test } from 'node:test'

import { sumarAjustes, topeEfectivo, validarAjustesIndividuales } from './ajustes.js'

function assertHttp422(operation) {
  assert.throws(operation, (error) => error.status === 422)
}

test('fixed amounts are compared to the percentage-equivalent effective cap per entry', () => {
  assert.equal(topeEfectivo(20, 10), 10)
  assert.doesNotThrow(() => validarAjustesIndividuales([{ monto: 100 }], 1000, 10, 'descuento'))
  assertHttp422(() => validarAjustesIndividuales([{ monto: 101 }], 1000, 10, 'descuento'))
})

test('percentage entries are validated individually while uncapped adjustments remain allowed', () => {
  assert.doesNotThrow(() => validarAjustesIndividuales([{ porcentaje: 10 }], 1000, 10, 'descuento'))
  assertHttp422(() => validarAjustesIndividuales([{ porcentaje: 11 }], 1000, 10, 'descuento'))
  assert.doesNotThrow(() =>
    validarAjustesIndividuales([{ monto: 1_000_000 }], 1000, null, 'descuento')
  )
})

test('invalid adjustment shapes and negative values reject with 422 instead of producing NaN', () => {
  for (const adjustment of [{}, { monto: 1, porcentaje: 1 }, { monto: -1 }, { porcentaje: -1 }]) {
    assertHttp422(() => validarAjustesIndividuales([adjustment], 1000, null, 'descuento'))
  }
})

test('aggregate cap remains applied to summed adjustments', () => {
  assert.equal(sumarAjustes([{ porcentaje: 8 }, { porcentaje: 7 }], 1000, 10), 100)
})
