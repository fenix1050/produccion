import assert from 'node:assert/strict'
import { test } from 'node:test'

import { editarCurvaRpfSchema } from './admin.schema.js'

// Cambio `rpf-variable-mrc`, Fase 3 (admin backend) — validación del bulk PUT de la grilla
// de 33 celdas (11 cuotas x 3 formas de pago). Archivo separado (no admin.schema.test.js,
// que no existía) siguiendo el mismo criterio de aislamiento que
// admin.controller.rubros-actividad.test.js.

function celda(overrides = {}) {
  return { forma_pago_id: 2, cuotas: 5, tasa_rpf: 3.04, ...overrides }
}

test('editarCurvaRpfSchema: acepta un payload de 33 celdas válidas', () => {
  const celdas = []
  for (const forma_pago_id of [1, 2, 3]) {
    for (let cuotas = 1; cuotas <= 11; cuotas++) {
      celdas.push(celda({ forma_pago_id, cuotas, tasa_rpf: cuotas * 0.5 }))
    }
  }
  assert.equal(celdas.length, 33)

  const resultado = editarCurvaRpfSchema.parse({ celdas })

  assert.equal(resultado.celdas.length, 33)
  assert.equal(resultado.celdas[0].forma_pago_id, 1)
})

test('editarCurvaRpfSchema: rechaza una celda sin tasa_rpf', () => {
  const celdas = [celda(), { forma_pago_id: 1, cuotas: 3 }]

  const resultado = editarCurvaRpfSchema.safeParse({ celdas })

  assert.equal(resultado.success, false)
})

test('editarCurvaRpfSchema: rechaza tasa_rpf negativa', () => {
  const resultado = editarCurvaRpfSchema.safeParse({ celdas: [celda({ tasa_rpf: -0.5 })] })

  assert.equal(resultado.success, false)
})

test('editarCurvaRpfSchema: rechaza cuotas fuera de rango (0 y > 24)', () => {
  const conCero = editarCurvaRpfSchema.safeParse({ celdas: [celda({ cuotas: 0 })] })
  const conTreinta = editarCurvaRpfSchema.safeParse({ celdas: [celda({ cuotas: 30 })] })

  assert.equal(conCero.success, false)
  assert.equal(conTreinta.success, false)
})

test('editarCurvaRpfSchema: rechaza array de celdas vacío', () => {
  const resultado = editarCurvaRpfSchema.safeParse({ celdas: [] })

  assert.equal(resultado.success, false)
})

test('editarCurvaRpfSchema: acepta tasa_rpf = 0 (Tarjeta de Crédito a 1-2 cuotas)', () => {
  const resultado = editarCurvaRpfSchema.safeParse({
    celdas: [celda({ forma_pago_id: 3, cuotas: 1, tasa_rpf: 0 })],
  })

  assert.equal(resultado.success, true)
})
