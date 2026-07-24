import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calcularPrima, calcularPlanPago } from './vida-ap.calculator.js';

// Verifica valores reales del motor de Vida y Accidentes Personales contra las reglas
// confirmadas en CLAUDE.md/PLAN_DESARROLLO.md — en particular, la decisión explícita (migración
// 023) de que este ramo NO tiene Prima Técnica Mínima/piso, a diferencia de MRC/Incendio.

const PISO_INCENDIO_MRC = 409_091; // solo para comparar que Vida/AP NUNCA fuerza este piso
const PISO_MAQUINARIA_INCENDIO = 100;

function catalogoBase() {
  return [
    { codigo: 'fallecimiento_cualquier_causa', nombre: 'Muerte por Cualquier Causa' },
    { codigo: 'reembolso_gastos_funerarios', nombre: 'Reembolso de Gastos Funerarios' },
    { codigo: 'muerte_accidente_ap', nombre: 'Muerte a Consecuencia de Accidente' },
    { codigo: 'invalidez_accidente_ap', nombre: 'Incapacidad Total y Permanente a Consecuencia de Accidente' },
    { codigo: 'gastos_medicos_accidente', nombre: 'Gastos Médicos por Accidente' },
    { codigo: 'renta_diaria_accidente', nombre: 'Renta Diaria por Accidente' },
    { codigo: 'perdidas_organicas', nombre: 'Pérdidas Orgánicas / Desmembramiento por Accidente' },
  ];
}

describe('vida-ap.calculator — SIN Prima Técnica Mínima (confirmado en el código, no se asume)', () => {
  test('capital muy bajo produce una prima muy baja real — NO se fuerza a ningún piso', async () => {
    const resultado = await calcularPrima({
      plan: { nombre: 'PROTECCION FAMILIAR' },
      riesgoDatos: { capital_asegurado: 1000 },
      tarifas: [{ cobertura_codigo: 'fallecimiento_cualquier_causa', tasa: 10 }],
      catalogoRamo: catalogoBase(),
    });
    // prima = 1000 * 10/1000 = 10 — un valor real ínfimo, sin ningún MAX(..., piso) en el código.
    assert.equal(resultado.prima, 10);
    assert.notEqual(resultado.prima, PISO_INCENDIO_MRC);
    assert.notEqual(resultado.prima, PISO_MAQUINARIA_INCENDIO);
    assert.ok(resultado.prima < PISO_MAQUINARIA_INCENDIO, 'la prima real debe ser incluso menor al piso más chico de Incendio (Gs. 100)');
  });
});

describe('vida-ap.calculator — Protección Familiar (tasa fija 10‰)', () => {
  test('prima = capital × 10‰', async () => {
    const resultado = await calcularPrima({
      plan: { nombre: 'PROTECCION FAMILIAR' },
      riesgoDatos: { capital_asegurado: 50_000_000 },
      tarifas: [{ cobertura_codigo: 'fallecimiento_cualquier_causa', tasa: 10 }],
      catalogoRamo: catalogoBase(),
    });
    assert.equal(resultado.prima, 500_000);
    assert.equal(resultado.detalle.tasa_fallecimiento, 10);
  });

  test('rechaza si falta la tasa de fallecimiento_cualquier_causa', async () => {
    await assert.rejects(
      () =>
        calcularPrima({
          plan: { nombre: 'PROTECCION FAMILIAR' },
          riesgoDatos: { capital_asegurado: 50_000_000 },
          tarifas: [],
          catalogoRamo: catalogoBase(),
        }),
      (err) => {
        assert.equal(err.status, 422);
        assert.match(err.message, /Falta la tasa de "fallecimiento_cualquier_causa"/);
        return true;
      }
    );
  });
});

describe('vida-ap.calculator — Accidentes Personales (Cooperativo/Privado) con Renta Diaria', () => {
  test('prima base + recargo por renta diaria dentro del tope (1‰ del capital de Muerte)', async () => {
    const resultado = await calcularPrima({
      plan: { nombre: 'ACCIDENTES PERSONALES - SECTOR COOPERATIVO' },
      riesgoDatos: { capital_asegurado: 10_000_000, edad: 40, incluye_renta_diaria: true, suma_renta_diaria: 5000 },
      tarifas: [
        { cobertura_codigo: 'muerte_accidente_ap', tasa: 5 },
        { cobertura_codigo: 'renta_diaria_accidente', recargo_pct: 20 },
      ],
      catalogoRamo: catalogoBase(),
    });
    // primaBase = 10.000.000*5/1000 = 50.000; costoRentaDiaria = 50.000*20/100 = 10.000
    assert.equal(resultado.detalle.prima_base, 50_000);
    assert.equal(resultado.detalle.costo_renta_diaria, 10_000);
    assert.equal(resultado.prima, 60_000);
  });

  test('rechaza si la Renta Diaria solicitada supera el 1‰ del capital de Muerte', async () => {
    await assert.rejects(
      () =>
        calcularPrima({
          plan: { nombre: 'ACCIDENTES PERSONALES - SECTOR COOPERATIVO' },
          riesgoDatos: { capital_asegurado: 10_000_000, edad: 40, incluye_renta_diaria: true, suma_renta_diaria: 20_000 },
          tarifas: [
            { cobertura_codigo: 'muerte_accidente_ap', tasa: 5 },
            { cobertura_codigo: 'renta_diaria_accidente', recargo_pct: 20 },
          ],
          catalogoRamo: catalogoBase(),
        }),
      (err) => {
        assert.equal(err.status, 422);
        assert.match(err.message, /supera el 1‰ del capital de Muerte/);
        return true;
      }
    );
  });

  test('rechaza edad 70-80 años (recargo del manual ambiguo, sin confirmar)', async () => {
    await assert.rejects(
      () =>
        calcularPrima({
          plan: { nombre: 'ACCIDENTES PERSONALES - SECTOR PRIVADO' },
          riesgoDatos: { capital_asegurado: 10_000_000, edad: 75 },
          tarifas: [{ cobertura_codigo: 'muerte_accidente_ap', tasa: 5 }],
          catalogoRamo: catalogoBase(),
        }),
      (err) => {
        assert.equal(err.status, 422);
        assert.match(err.message, /recargo para edad 70-80 años/);
        return true;
      }
    );
  });
});

describe('vida-ap.calculator — Vida Directivos y Empleados (tasa por franja etaria)', () => {
  const TARIFAS_DIRECTIVOS = [
    { cobertura_codigo: 'fallecimiento_cualquier_causa', tasa: 2, edad_min: 18, edad_max: 30 },
    { cobertura_codigo: 'fallecimiento_cualquier_causa', tasa: 3, edad_min: 31, edad_max: 50 },
    { cobertura_codigo: 'fallecimiento_cualquier_causa', tasa: 5, edad_min: 51, edad_max: 69 },
  ];

  test('usa la tasa de la franja etaria correcta (40 años → 3‰)', async () => {
    const resultado = await calcularPrima({
      plan: { nombre: 'VIDA DIRECTIVOS Y EMPLEADOS' },
      riesgoDatos: { capital_asegurado: 20_000_000, edad: 40 },
      tarifas: TARIFAS_DIRECTIVOS,
      catalogoRamo: catalogoBase(),
    });
    assert.equal(resultado.detalle.tasa_fallecimiento, 3);
    assert.equal(resultado.prima, 60_000); // 20.000.000 * 3/1000
  });

  test('rechaza edad fuera del rango asegurable (18-69 años)', async () => {
    await assert.rejects(
      () =>
        calcularPrima({
          plan: { nombre: 'VIDA DIRECTIVOS Y EMPLEADOS' },
          riesgoDatos: { capital_asegurado: 20_000_000, edad: 75 },
          tarifas: TARIFAS_DIRECTIVOS,
          catalogoRamo: catalogoBase(),
        }),
      (err) => {
        assert.equal(err.status, 422);
        assert.match(err.message, /fuera del rango asegurable/);
        return true;
      }
    );
  });
});

describe('vida-ap.calculator — plan sin lógica de cálculo implementada', () => {
  test('rechaza planes que tarifican por saldo mensual (Protección de Préstamos / Aportes y Ahorros)', async () => {
    await assert.rejects(
      () =>
        calcularPrima({
          plan: { nombre: 'PROTECCION DE PRESTAMOS - COOPERATIVAS' },
          riesgoDatos: { capital_asegurado: 10_000_000 },
          tarifas: [],
          catalogoRamo: catalogoBase(),
        }),
      (err) => {
        assert.equal(err.status, 422);
        assert.match(err.message, /tarifica por saldo mensual/);
        return true;
      }
    );
  });
});

describe('vida-ap.calculator — calcularPlanPago — 4 formas de pago simultáneas', () => {
  const PRIMA = 1_234_000; // deliberadamente no-redondo para que el redondeo realmente aplique

  test('Contado: RPF=0%, inicial === premio, cuota === 0', () => {
    const resultado = calcularPlanPago(PRIMA, { codigo: 'contado', tasa_rpf: 0 }, 0);
    // iva = 1.234.000*0.10 = 123.400; premio_bruto = 1.357.400 → floor 1.357.000
    assert.equal(resultado.rpf, 0);
    assert.equal(resultado.iva, 123_400);
    assert.equal(resultado.premio, 1_357_000);
    assert.equal(resultado.inicial, resultado.premio);
    assert.equal(resultado.cuota, 0);
  });

  test('Cobrador: RPF fijo 1,6%', () => {
    const resultado = calcularPlanPago(PRIMA, { codigo: 'cobrador', tasa_rpf: 1.6 }, 0);
    // rpf_bruto = 1.234.000*0.016 = 19.744 → ceil a 20.000
    // iva = 123.400 + 2.000 = 125.400; premio_bruto = 1.234.000+20.000+125.400 = 1.379.400 → floor 1.379.000
    assert.equal(resultado.rpf, 20_000);
    assert.equal(resultado.iva, 125_400);
    assert.equal(resultado.premio, 1_379_000);
  });

  test('Boca de Cobranza: RPF fijo 1,35%', () => {
    const resultado = calcularPlanPago(PRIMA, { codigo: 'boca_cobranza', tasa_rpf: 1.35 }, 0);
    // rpf_bruto = 1.234.000*0.0135 = 16.659 → ceil a 17.000
    // iva = 123.400 + 1.700 = 125.100; premio_bruto = 1.234.000+17.000+125.100 = 1.376.100 → floor 1.376.000
    assert.equal(resultado.rpf, 17_000);
    assert.equal(resultado.iva, 125_100);
    assert.equal(resultado.premio, 1_376_000);
  });

  test('Tarjeta de Crédito: RPF fijo 1%', () => {
    const resultado = calcularPlanPago(PRIMA, { codigo: 'tarjeta', tasa_rpf: 1 }, 0);
    // rpf_bruto = 1.234.000*0.01 = 12.340 → ceil a 13.000
    // iva = 123.400 + 1.300 = 124.700; premio_bruto = 1.234.000+13.000+124.700 = 1.371.700 → floor 1.371.000
    assert.equal(resultado.rpf, 13_000);
    assert.equal(resultado.iva, 124_700);
    assert.equal(resultado.premio, 1_371_000);
  });
});

describe('vida-ap.calculator — redondeo e invariante Inicial + N×Cuota === Premio', () => {
  test('RPF redondea hacia ARRIBA cuando el bruto no es redondo (Cobrador)', () => {
    const resultado = calcularPlanPago(1_234_000, { codigo: 'cobrador', tasa_rpf: 1.6 }, 0);
    assert.equal(resultado.rpf, 20_000);
    assert.notEqual(resultado.rpf, 19_000);
  });

  test('Cuota redondea hacia ABAJO y la invariante Inicial + N×Cuota === Premio se cumple exacto', () => {
    // premio = 1.379.000 (Cobrador), cuotas = 2 → 1.379.000/3 = 459.666,67 (no redondo)
    const resultado = calcularPlanPago(1_234_000, { codigo: 'cobrador', tasa_rpf: 1.6 }, 2);
    assert.equal(resultado.premio, 1_379_000);
    assert.equal(resultado.cuota, 459_000);
    assert.notEqual(resultado.cuota, 460_000);
    assert.equal(resultado.inicial + 2 * resultado.cuota, resultado.premio);
  });
});
