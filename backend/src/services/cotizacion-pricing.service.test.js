import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { resolverDescuentos, resolverTasaRpf } from './cotizacion-pricing.service.js'

// Relocado desde cotizacion.service.test.js (cambio SDD `cotizacion-service-split`, PR 3a).
// `resolverDescuentos`/`resolverTasaRpf` son funciones puras — no dependen de ningún repository
// ni de Supabase, así que este archivo importa `cotizacion-pricing.service.js` directamente,
// sin mocks (a diferencia de `cotizacion.service.test.js`, que sí necesita mockear repositories
// para evitar cargar la cadena real hacia `config/supabase.js`).

// resolverDescuentos: helper puro (cambio SDD `mrc-plan-descuento-fijo`) que decide, ANTES de
// invocar al calculador, si el descuento efectivo es el que mandó el body o el forzado por
// `plan.descuento_default` — ver design.md Decisión 1. `forzadoPorPlan` es lo que después
// neutraliza el tope del usuario en el calculador (Decisión 2), así que se testea acá como
// parte del contrato del helper, no solo el array de `descuentos`.
describe('resolverDescuentos', () => {
  const PLAN_SIN_DESCUENTO_DEFAULT = { descuento_default: null, cotizacion_combinada: false }
  const PLAN_MRC_10 = { descuento_default: 10, cotizacion_combinada: false }
  const PLAN_AUTO_COMBINADO = { descuento_default: 20, cotizacion_combinada: true }

  test('plan sin descuento_default: el body pasa intacto, forzadoPorPlan=false', () => {
    const descuentosBody = [{ descripcion: 'Descuento agente', porcentaje: 15 }]
    const resultado = resolverDescuentos({
      plan: PLAN_SIN_DESCUENTO_DEFAULT,
      descuentosBody,
      usuario: { puede_editar_descuento_plan: false },
    })

    assert.deepEqual(resultado.descuentos, descuentosBody)
    assert.equal(resultado.forzadoPorPlan, false)
  })

  test('plan con descuento_default + usuario CON permiso: el body pasa intacto', () => {
    const descuentosBody = [{ descripcion: 'Descuento agente', porcentaje: 5 }]
    const resultado = resolverDescuentos({
      plan: PLAN_MRC_10,
      descuentosBody,
      usuario: { puede_editar_descuento_plan: true },
    })

    assert.deepEqual(resultado.descuentos, descuentosBody)
    assert.equal(resultado.forzadoPorPlan, false)
  })

  test('plan con descuento_default + usuario SIN permiso: ignora el body, fuerza el 10% del plan', () => {
    const descuentosBody = [{ descripcion: 'Descuento agente', porcentaje: 5 }]
    const resultado = resolverDescuentos({
      plan: PLAN_MRC_10,
      descuentosBody,
      usuario: { puede_editar_descuento_plan: false },
    })

    assert.deepEqual(resultado.descuentos, [{ descripcion: 'Descuento del plan', porcentaje: 10 }])
    assert.equal(resultado.forzadoPorPlan, true)
  })

  test('plan con descuento_default + usuario undefined (sin sesión mockeada): fuerza igual', () => {
    const resultado = resolverDescuentos({
      plan: PLAN_MRC_10,
      descuentosBody: [{ porcentaje: 99 }],
      usuario: undefined,
    })

    assert.deepEqual(resultado.descuentos, [{ descripcion: 'Descuento del plan', porcentaje: 10 }])
    assert.equal(resultado.forzadoPorPlan, true)
  })

  test('plan Auto con cotizacion_combinada=true: NUNCA fuerza, aunque tenga descuento_default', () => {
    const descuentosBody = [{ porcentaje: 3 }]
    const resultado = resolverDescuentos({
      plan: PLAN_AUTO_COMBINADO,
      descuentosBody,
      usuario: { puede_editar_descuento_plan: false },
    })

    assert.deepEqual(resultado.descuentos, descuentosBody)
    assert.equal(resultado.forzadoPorPlan, false)
  })

  test('plan con descuento_default + sin body (undefined): fuerza igual, no rompe', () => {
    const resultado = resolverDescuentos({
      plan: PLAN_MRC_10,
      descuentosBody: undefined,
      usuario: { puede_editar_descuento_plan: false },
    })

    assert.deepEqual(resultado.descuentos, [{ descripcion: 'Descuento del plan', porcentaje: 10 }])
    assert.equal(resultado.forzadoPorPlan, true)
  })

  test('plan sin descuento_default + body undefined: devuelve array vacío, no rompe', () => {
    const resultado = resolverDescuentos({
      plan: PLAN_SIN_DESCUENTO_DEFAULT,
      descuentosBody: undefined,
      usuario: { puede_editar_descuento_plan: false },
    })

    assert.deepEqual(resultado.descuentos, [])
    assert.equal(resultado.forzadoPorPlan, false)
  })
})

// resolverTasaRpf: helper puro (cambio SDD `rpf-variable-mrc`, ver design.md — Data Flow) que
// decide, para CADA forma de pago de la variante, si la tasa de R.P.F. sale de la curva nueva
// (`rpf_cuotas`, ramos flagueados) o del escalar legacy `plan_formas_pago.tasa_rpf` (todo lo
// demás, byte-idéntico).
describe('resolverTasaRpf', () => {
  const RAMO_FLAGGED = { usa_rpf_por_cuotas: true }
  const RAMO_NO_FLAGGED = { usa_rpf_por_cuotas: false }

  // Subconjunto real de la curva (migración 058, Hoja4).
  const CURVA = [
    { forma_pago_id: 1, cuotas: 3, tasa_rpf: 1.6889, formas_pago: { codigo: 'cobrador' } },
    { forma_pago_id: 1, cuotas: 11, tasa_rpf: 9.5, formas_pago: { codigo: 'cobrador' } },
    { forma_pago_id: 2, cuotas: 1, tasa_rpf: 0, formas_pago: { codigo: 'tarjeta_credito' } },
    { forma_pago_id: 2, cuotas: 3, tasa_rpf: 0.8, formas_pago: { codigo: 'tarjeta_credito' } },
    { forma_pago_id: 3, cuotas: 5, tasa_rpf: 3.04, formas_pago: { codigo: 'boca_cobranza' } },
  ]

  test('ramo flagueado + cuotas dentro de rango: devuelve el valor de la curva, no el escalar', () => {
    const formaPagoPlan = { tasa_rpf: 99, formas_pago: { codigo: 'cobrador' } }

    const resultado = resolverTasaRpf({
      ramo: RAMO_FLAGGED,
      formaPagoPlan,
      curva: CURVA,
      cuotas: 3,
    })

    assert.equal(resultado, 1.6889)
  })

  test('ramo NO flagueado (Auto): devuelve el escalar legacy sin tocar la curva, sin importar la cantidad de cuotas', () => {
    const formaPagoPlan = { tasa_rpf: 5, formas_pago: { codigo: 'cobrador' } }

    // Regresión (design.md — Testing Strategy): el escalar de Auto no debe variar con la
    // cantidad de cuotas, a diferencia de la curva nueva de los 3 ramos flagueados.
    const con3Cuotas = resolverTasaRpf({
      ramo: RAMO_NO_FLAGGED,
      formaPagoPlan,
      curva: null,
      cuotas: 3,
    })
    const con11Cuotas = resolverTasaRpf({
      ramo: RAMO_NO_FLAGGED,
      formaPagoPlan,
      curva: null,
      cuotas: 11,
    })

    assert.equal(con3Cuotas, 5)
    assert.equal(con11Cuotas, 5)
  })

  test('forma de pago contado: siempre 0, sin importar el flag ni la curva', () => {
    const formaPagoPlan = { tasa_rpf: 999, formas_pago: { codigo: 'contado' } }

    const resultado = resolverTasaRpf({
      ramo: RAMO_FLAGGED,
      formaPagoPlan,
      curva: CURVA,
      cuotas: 5,
    })

    assert.equal(resultado, 0)
  })

  test('ramo flagueado + forma financiada con cuotas=0: devuelve 0 por regla, no el escalar (design.md Decisión 4)', () => {
    const formaPagoPlan = { tasa_rpf: 99, formas_pago: { codigo: 'cobrador' } }

    const resultado = resolverTasaRpf({
      ramo: RAMO_FLAGGED,
      formaPagoPlan,
      curva: CURVA,
      cuotas: 0,
    })

    assert.equal(resultado, 0)
  })

  test('ramo flagueado + cuotas fuera de rango: 422 explícito, sin clamp', () => {
    const formaPagoPlan = { tasa_rpf: 99, formas_pago: { codigo: 'cobrador' } }

    assert.throws(
      () => resolverTasaRpf({ ramo: RAMO_FLAGGED, formaPagoPlan, curva: CURVA, cuotas: 12 }),
      (err) => {
        assert.equal(err.status, 422)
        return true
      }
    )
  })

  test('Tarjeta de Crédito @ 1 cuota: devuelve 0 literal (fila real, no ausente)', () => {
    const formaPagoPlan = { tasa_rpf: 99, formas_pago: { codigo: 'tarjeta_credito' } }

    const resultado = resolverTasaRpf({
      ramo: RAMO_FLAGGED,
      formaPagoPlan,
      curva: CURVA,
      cuotas: 1,
    })

    assert.equal(resultado, 0)
  })

  // Cierra el gap de sdd-verify (obs #397, spec matrix fila 6): a diferencia de 1-2 cuotas
  // (0% literal), a partir de 3 cuotas Tarjeta de Crédito SÍ cobra R.P.F. — confirma que no hay
  // un atajo de código que devuelva 0 para toda la forma de pago, solo para las cuotas exactas
  // que la planilla marca en 0.
  test('Tarjeta de Crédito @ 3 cuotas: no-cero (distinto de 1-2 cuotas)', () => {
    const formaPagoPlan = { tasa_rpf: 99, formas_pago: { codigo: 'tarjeta_credito' } }

    const resultado = resolverTasaRpf({
      ramo: RAMO_FLAGGED,
      formaPagoPlan,
      curva: CURVA,
      cuotas: 3,
    })

    assert.equal(resultado, 0.8)
  })

  // Cierra el gap de sdd-verify (obs #397, spec matrix fila 3): prueba explícita del mapeo
  // "Aquí Pago" (Excel) -> `boca_cobranza` (sistema) — hasta ahora solo probado genéricamente
  // vía Cobrador/Tarjeta, nunca con este código puntual.
  test('Boca de Cobranza @ 5 cuotas: resuelve desde la columna "Aquí Pago" de la curva', () => {
    const formaPagoPlan = { tasa_rpf: 99, formas_pago: { codigo: 'boca_cobranza' } }

    const resultado = resolverTasaRpf({
      ramo: RAMO_FLAGGED,
      formaPagoPlan,
      curva: CURVA,
      cuotas: 5,
    })

    assert.equal(resultado, 3.04)
  })
})
