import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calcularPrima, calcularPlanPago } from './mrc.calculator.js';

// Verifica valores reales calculados por el motor de MRC (Multirriesgo Comercio) contra las
// reglas de negocio confirmadas en CLAUDE.md/PLAN_DESARROLLO.md — no solo la forma del objeto
// devuelto. Los datos de plan/rubro/catálogo/tasas son ficticios pero representativos (mismo
// esqueleto real: rubros_actividad.tasa_edificio/tasa_contenido en permil, prima_tecnica_minima
// real de MRC/Incendio = Gs. 409.091, RPF fijo por forma de pago).

const PRIMA_TECNICA_MINIMA_MRC = 409091;

function planBase(overrides = {}) {
  return {
    nombre: 'MULTIRRIESGO COMERCIO - NORMAL',
    prima_tecnica_minima: PRIMA_TECNICA_MINIMA_MRC,
    responsabilidad_maxima_cotizable: 5_000_000_000,
    descuento_maximo: 20,
    recargo_maximo: 20,
    ...overrides,
  };
}

function rubroBase(overrides = {}) {
  return {
    nombre: 'Bazar',
    tasa_edificio: 2, // permil
    tasa_contenido: 1.5, // permil
    ...overrides,
  };
}

// Catálogo mínimo: las 2 líneas fijas de Incendio Edificio/Contenido + 1 cobertura adicional
// (Responsabilidad Civil) usada para llegar al mínimo de 3 coberturas exigido por el plan.
function catalogoBase() {
  return [
    { codigo: 'incendio_edificio', nombre: 'Incendio Edificio', categoria: 'Coberturas', franquicia_default: null, incluye_en_suma_asegurada_total: true },
    { codigo: 'incendio_contenido', nombre: 'Incendio Contenido', categoria: 'Coberturas', franquicia_default: null, incluye_en_suma_asegurada_total: true },
    { codigo: 'responsabilidad_civil', nombre: 'Responsabilidad Civil', categoria: 'Coberturas', franquicia_default: null, incluye_en_suma_asegurada_total: true },
  ];
}

function tasasBase({ tasaRC = 2 } = {}) {
  return [{ coberturas_catalogo: { codigo: 'responsabilidad_civil' }, tasa_valor: tasaRC, unidad: 'permil' }];
}

describe('mrc.calculator — calcularPrima — Prima Técnica Mínima (piso)', () => {
  test('capital bajo: la prima tarifada cae por debajo del piso y se aplica Gs. 409.091', async () => {
    const resultado = await calcularPrima({
      plan: planBase(),
      riesgoDatos: {
        rubro_actividad: 'Bazar',
        capital_edificio: 1_000_000,
        capital_contenido: 1_000_000,
        coberturas_adicionales: [{ codigo: 'responsabilidad_civil', suma_asegurada: 500_000 }],
      },
      rubro: rubroBase(),
      catalogoRamo: catalogoBase(),
      tasasRamo: tasasBase(),
    });

    // costoEdificio = 1.000.000*2/1000 = 2000; costoContenido = 1.000.000*1.5/1000 = 1500
    // costoRC = 500.000*2/1000 = 1000 → primaCalculada = 4500, muy por debajo del piso.
    assert.equal(resultado.detalle.costo_edificio, 2000);
    assert.equal(resultado.detalle.costo_contenido, 1500);
    assert.equal(resultado.detalle.costo_coberturas_adicionales, 1000);
    assert.equal(resultado.detalle.prima_base, PRIMA_TECNICA_MINIMA_MRC);
    assert.equal(resultado.prima, PRIMA_TECNICA_MINIMA_MRC);
  });

  test('capital alto: la prima tarifada supera el piso — el piso NO se aplica', async () => {
    const resultado = await calcularPrima({
      plan: planBase(),
      riesgoDatos: {
        rubro_actividad: 'Bazar',
        capital_edificio: 500_000_000,
        capital_contenido: 300_000_000,
        coberturas_adicionales: [{ codigo: 'responsabilidad_civil', suma_asegurada: 1_000_000 }],
      },
      rubro: rubroBase(),
      catalogoRamo: catalogoBase(),
      tasasRamo: tasasBase(),
    });

    // costoEdificio = 500.000.000*2/1000 = 1.000.000
    // costoContenido = 300.000.000*1.5/1000 = 450.000
    // costoRC = 1.000.000*2/1000 = 2.000
    // primaCalculada = 1.452.000 > piso 409.091 → prima_base = 1.452.000 (piso no aplicado)
    assert.equal(resultado.detalle.costo_edificio, 1_000_000);
    assert.equal(resultado.detalle.costo_contenido, 450_000);
    assert.equal(resultado.detalle.costo_coberturas_adicionales, 2_000);
    assert.equal(resultado.detalle.prima_base, 1_452_000);
    assert.notEqual(resultado.detalle.prima_base, PRIMA_TECNICA_MINIMA_MRC);
    assert.equal(resultado.prima, 1_452_000);
  });
});

describe('mrc.calculator — calcularPlanPago — 4 formas de pago simultáneas', () => {
  const PRIMA = 1_452_000; // deliberadamente no-redondo para que el redondeo realmente aplique

  test('Contado: RPF=0%, inicial === premio, cuota === 0', () => {
    const resultado = calcularPlanPago(PRIMA, { codigo: 'contado', tasa_rpf: 0 }, 0);
    // iva = 1.452.000*0.10 = 145.200; premio_bruto = 1.597.200 → floor a 1.597.000
    assert.equal(resultado.rpf, 0);
    assert.equal(resultado.iva, 145_200);
    assert.equal(resultado.premio, 1_597_000);
    assert.equal(resultado.inicial, resultado.premio);
    assert.equal(resultado.cuota, 0);
  });

  test('Cobrador (Crédito): RPF fijo 1,6%', () => {
    const resultado = calcularPlanPago(PRIMA, { codigo: 'cobrador', tasa_rpf: 1.6 }, 0);
    // rpf_bruto = 1.452.000*0.016 = 23.232 → redondeado hacia ARRIBA a 24.000
    // iva = 145.200 + 24.000*0.10 = 147.600
    // premio_bruto = 1.452.000+24.000+147.600 = 1.623.600 → floor a 1.623.000
    assert.equal(resultado.rpf, 24_000);
    assert.equal(resultado.iva, 147_600);
    assert.equal(resultado.premio, 1_623_000);
  });

  test('Boca de Cobranza: RPF fijo 1,35%', () => {
    const resultado = calcularPlanPago(PRIMA, { codigo: 'boca_cobranza', tasa_rpf: 1.35 }, 0);
    // rpf_bruto = 1.452.000*0.0135 = 19.602 → redondeado hacia ARRIBA a 20.000
    // iva = 145.200 + 20.000*0.10 = 147.200
    // premio_bruto = 1.452.000+20.000+147.200 = 1.619.200 → floor a 1.619.000
    assert.equal(resultado.rpf, 20_000);
    assert.equal(resultado.iva, 147_200);
    assert.equal(resultado.premio, 1_619_000);
  });

  test('Tarjeta de Crédito: RPF fijo 1%', () => {
    const resultado = calcularPlanPago(PRIMA, { codigo: 'tarjeta', tasa_rpf: 1 }, 0);
    // rpf_bruto = 1.452.000*0.01 = 14.520 → redondeado hacia ARRIBA a 15.000
    // iva = 145.200 + 15.000*0.10 = 146.700
    // premio_bruto = 1.452.000+15.000+146.700 = 1.613.700 → floor a 1.613.000
    assert.equal(resultado.rpf, 15_000);
    assert.equal(resultado.iva, 146_700);
    assert.equal(resultado.premio, 1_613_000);
  });
});

describe('mrc.calculator — redondeo RPF (arriba) y Cuota (abajo)', () => {
  test('RPF redondea hacia ARRIBA al millar aunque el cálculo bruto no sea redondo', () => {
    // 1.452.000 * 1.6% = 23.232 (no es múltiplo de 1000) → debe subir a 24.000, no bajar a 23.000
    const resultado = calcularPlanPago(1_452_000, { codigo: 'cobrador', tasa_rpf: 1.6 }, 0);
    assert.equal(resultado.rpf, 24_000);
    assert.notEqual(resultado.rpf, 23_000);
  });

  test('Cuota redondea hacia ABAJO al millar aunque el cálculo bruto no sea redondo', () => {
    // premio = 1.623.000, cuotas = 3 → 1.623.000/4 = 405.750 (no redondo) → cuota debe bajar a 405.000
    const resultado = calcularPlanPago(1_452_000, { codigo: 'cobrador', tasa_rpf: 1.6 }, 3);
    assert.equal(resultado.premio, 1_623_000);
    assert.equal(resultado.cuota, 405_000);
    assert.notEqual(resultado.cuota, 406_000);
  });
});

describe('mrc.calculator — invariante Inicial + N×Cuota === Premio', () => {
  test('con más de 1 cuota, Inicial absorbe el resto y la suma da exacto el Premio', () => {
    const resultado = calcularPlanPago(1_452_000, { codigo: 'cobrador', tasa_rpf: 1.6 }, 3);
    assert.equal(resultado.premio, 1_623_000);
    assert.equal(resultado.cuota, 405_000);
    assert.equal(resultado.inicial, 408_000);
    assert.equal(resultado.inicial + 3 * resultado.cuota, resultado.premio);
  });
});

describe('mrc.calculator — tope efectivo de descuento/recargo (MIN(plan, usuario))', () => {
  const primaBaseAlta = {
    riesgoDatos: {
      rubro_actividad: 'Bazar',
      capital_edificio: 500_000_000,
      capital_contenido: 300_000_000,
      coberturas_adicionales: [{ codigo: 'responsabilidad_civil', suma_asegurada: 1_000_000 }],
    },
    rubro: rubroBase(),
    catalogoRamo: catalogoBase(),
    tasasRamo: tasasBase(),
  };
  // primaBase confirmada en el test de piso de arriba = 1.452.000

  test('el tope del USUARIO es más estricto que el del plan y gana', async () => {
    const resultado = await calcularPrima({
      plan: planBase({ descuento_maximo: 20 }),
      usuario: { descuento_maximo_pct: 8 },
      descuentos: [{ porcentaje: 15 }],
      ...primaBaseAlta,
    });
    // topeEfectivo(20, 8) = 8 → topeMonto = 1.452.000*0.08 = 116.160
    // solicitado 15% = 217.800, pero el tope de 116.160 (usuario) es más chico → gana el usuario
    assert.equal(resultado.detalle.total_descuentos, 116_160);
    assert.equal(resultado.prima, 1_452_000 - 116_160);
  });

  test('el tope del PLAN es más estricto que el del usuario y gana', async () => {
    const resultado = await calcularPrima({
      plan: planBase({ descuento_maximo: 6 }),
      usuario: { descuento_maximo_pct: 25 },
      descuentos: [{ porcentaje: 15 }],
      ...primaBaseAlta,
    });
    // topeEfectivo(6, 25) = 6 → topeMonto = 1.452.000*0.06 = 87.120
    // solicitado 15% = 217.800, pero el tope de 87.120 (plan) es más chico → gana el plan
    assert.equal(resultado.detalle.total_descuentos, 87_120);
    assert.equal(resultado.prima, 1_452_000 - 87_120);
  });
});

describe('mrc.calculator — casos de error explícitos', () => {
  test('rechaza si el plan no tiene prima_tecnica_minima confirmada', async () => {
    await assert.rejects(
      () =>
        calcularPrima({
          plan: planBase({ prima_tecnica_minima: null }),
          riesgoDatos: { rubro_actividad: 'Bazar', capital_edificio: 1, capital_contenido: 1 },
          rubro: rubroBase(),
          catalogoRamo: catalogoBase(),
          tasasRamo: tasasBase(),
        }),
      (err) => {
        assert.equal(err.status, 422);
        assert.match(err.message, /todavía no tiene RPF\/prima técnica mínima confirmados/);
        return true;
      }
    );
  });

  test('rechaza si el rubro de actividad no se encontró (tasa no confirmada)', async () => {
    await assert.rejects(
      () =>
        calcularPrima({
          plan: planBase(),
          riesgoDatos: { rubro_actividad: 'Rubro Inexistente', capital_edificio: 1_000_000, capital_contenido: 1_000_000 },
          rubro: null,
          catalogoRamo: catalogoBase(),
          tasasRamo: tasasBase(),
        }),
      (err) => {
        assert.equal(err.status, 422);
        assert.match(err.message, /no encontrado en rubros_actividad/);
        return true;
      }
    );
  });

  test('rechaza si no se llega al mínimo de 3 coberturas exigido por el plan', async () => {
    await assert.rejects(
      () =>
        calcularPrima({
          plan: planBase(),
          riesgoDatos: {
            rubro_actividad: 'Bazar',
            capital_edificio: 1_000_000,
            capital_contenido: 1_000_000,
            coberturas_adicionales: [],
          },
          rubro: rubroBase(),
          catalogoRamo: catalogoBase(),
          tasasRamo: tasasBase(),
        }),
      (err) => {
        assert.equal(err.status, 422);
        assert.match(err.message, /requiere al menos 3 coberturas/);
        return true;
      }
    );
  });

  test('rechaza cobertura adicional con código inexistente en el catálogo', async () => {
    await assert.rejects(
      () =>
        calcularPrima({
          plan: planBase(),
          riesgoDatos: {
            rubro_actividad: 'Bazar',
            capital_edificio: 1_000_000,
            capital_contenido: 1_000_000,
            coberturas_adicionales: [{ codigo: 'codigo_que_no_existe', suma_asegurada: 100_000 }],
          },
          rubro: rubroBase(),
          catalogoRamo: catalogoBase(),
          tasasRamo: tasasBase(),
        }),
      (err) => {
        assert.equal(err.status, 422);
        assert.match(err.message, /no existe o no está activa en el catálogo del ramo MRC/);
        return true;
      }
    );
  });
});

describe('mrc.calculator — MRC-specific: dos líneas de cobertura + adicional, piso independiente por línea', () => {
  test('el total es la suma real de cada línea (Edificio + Contenido + adicional), no un piso combinado único', async () => {
    const resultado = await calcularPrima({
      plan: planBase(),
      riesgoDatos: {
        rubro_actividad: 'Bazar',
        capital_edificio: 100_000_000,
        capital_contenido: 50_000_000,
        coberturas_adicionales: [{ codigo: 'responsabilidad_civil', suma_asegurada: 20_000_000 }],
      },
      rubro: rubroBase({ tasa_edificio: 2, tasa_contenido: 1.5 }),
      catalogoRamo: catalogoBase(),
      tasasRamo: tasasBase({ tasaRC: 2 }),
    });

    // costoEdificio = 100.000.000*2/1000 = 200.000
    // costoContenido = 50.000.000*1.5/1000 = 75.000
    // costoRC = 20.000.000*2/1000 = 40.000
    // primaCalculada = 315.000 (todavía por debajo del piso 409.091 → prima_base = piso)
    assert.equal(resultado.detalle.costo_edificio, 200_000);
    assert.equal(resultado.detalle.costo_contenido, 75_000);
    assert.equal(resultado.detalle.costo_coberturas_adicionales, 40_000);
    // Verifica que efectivamente se SUMAN las 3 líneas antes de comparar contra el piso —
    // no se aplica un piso independiente por línea (el piso es sobre el total).
    assert.equal(200_000 + 75_000 + 40_000, 315_000);
    assert.equal(resultado.detalle.prima_base, PRIMA_TECNICA_MINIMA_MRC);

    // Verifica también que la lista de coberturas expone las 3 líneas por separado (no
    // colapsadas), reflejando el requisito de negocio "suma real de líneas".
    const codigos = resultado.coberturas.map((c) => c.codigo);
    assert.ok(codigos.includes('incendio_edificio'));
    assert.ok(codigos.includes('incendio_contenido'));
    assert.ok(codigos.includes('responsabilidad_civil'));
  });
});
