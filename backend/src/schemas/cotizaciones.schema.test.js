import assert from 'node:assert/strict'
import { test } from 'node:test'

import { cotizacionIdParamsSchema, planIdBodySchema } from './cotizaciones.schema.js'

const mensaje = (schema, input) => schema.safeParse(input).error?.issues[0]?.message

test('planIdBodySchema distingue plan_id ausente de plan_id no numérico', () => {
  assert.equal(mensaje(planIdBodySchema, {}), 'plan_id es obligatorio')
  assert.equal(mensaje(planIdBodySchema, { plan_id: 'abc' }), 'plan_id debe ser un número')
  assert.equal(planIdBodySchema.safeParse({ plan_id: 5 }).success, true)
})

test('cotizacionIdParamsSchema mantiene su mensaje para un id no numérico', () => {
  assert.equal(
    mensaje(cotizacionIdParamsSchema, { id: 'abc' }),
    'El id de la cotización debe ser un número'
  )
})
