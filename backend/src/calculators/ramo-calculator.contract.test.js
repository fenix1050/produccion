import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGISTRO } from './index.js';

// Verifica el contrato documentado en ramo-calculator.interface.js para cada calculador
// registrado (implementado o stub) — no valida lógica de negocio, solo la forma del contrato.

const FORMA_PAGO_DUMMY = { codigo: 'contado', tasa_rpf: 0 };
const CAMPOS_PLAN_PAGO = ['rpf', 'iva', 'premio', 'inicial', 'cuota'];

for (const [codigoRamo, calculador] of Object.entries(REGISTRO)) {
  test(`calculador "${codigoRamo}" expone calcularPrima/calcularPlanPago`, () => {
    assert.equal(typeof calculador.calcularPrima, 'function', 'calcularPrima debe ser una función');
    assert.equal(typeof calculador.calcularPlanPago, 'function', 'calcularPlanPago debe ser una función');
  });

  test(`calculador "${codigoRamo}" calcularPlanPago devuelve la forma esperada (o lanza explícito si no está implementado)`, () => {
    let resultado;
    try {
      resultado = calculador.calcularPlanPago(1000000, FORMA_PAGO_DUMMY, 0);
    } catch (err) {
      // Los calculadores stub (hogar/tro/transporte/auto-flota) lanzan explícito en vez de
      // implementar — es un contrato válido mientras el error tenga mensaje explicativo.
      assert.ok(err instanceof Error && err.message.length > 0);
      return;
    }
    assert.equal(typeof resultado, 'object');
    for (const campo of CAMPOS_PLAN_PAGO) {
      assert.equal(typeof resultado[campo], 'number', `"${campo}" debe ser number`);
    }
  });
}
