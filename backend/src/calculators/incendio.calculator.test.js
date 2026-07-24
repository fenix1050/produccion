import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calcularPrima, calcularPlanPago } from './incendio.calculator.js';

// Verifica valores reales del motor de Incendio contra las reglas confirmadas en
// CLAUDE.md/PLAN_DESARROLLO.md: Prima Técnica Mínima real = Gs. 409.091 (plan Edificio y
// Contenido) y tasa fija 0,7% (Maquinaria Básico), más el motor compartido de RPF/IVA/Premio.

const PISO_EDIFICIO_CONTENIDO = 409_091;

function planEdificioContenido(overrides = {}) {
  return {
    nombre: 'INCENDIO - EDIFICIO Y CONTENIDO',
    prima_tecnica_minima: PISO_EDIFICIO_CONTENIDO,
    responsabilidad_maxima_cotizable: 5_000_000_000,
    descuento_maximo: 20,
    recargo_maximo: 20,
    ...overrides,
  };
}

function planMaquinaria(overrides = {}) {
  return {
    nombre: 'MAQUINARIA BASICO',
    prima_tecnica_minima: 100,
    responsabilidad_maxima_cotizable: 5_000_000_000,
    descuento_maximo: 20,
    recargo_maximo: 20,
    ...overrides,
  };
}

function rubroBase(overrides = {}) {
  return { nombre: 'Bazar', tasa_edificio: 2, tasa_contenido: 1.5, ...overrides };
}

function catalogoBase() {
  return [
    { codigo: 'incendio_edificio', nombre: 'Incendio de Edificio', franquicia_default: null },
    { codigo: 'incendio_contenido', nombre: 'Incendio de Contenido', franquicia_default: null },
    { codigo: 'incendio_maquinaria', nombre: 'Incendio de Maquinaria', franquicia_default: null },
    { codigo: 'sublimite_fenomenos_naturales', nombre: 'Sublímite por Fenómenos Naturales' },
    { codigo: 'sublimite_vandalismo_maquinaria', nombre: 'Sublímite por Vandalismo (Maquinaria)' },
  ];
}

function tasasMaquinaria(tasaValor = 7) {
  return [{ coberturas_catalogo: { codigo: 'incendio_maquinaria' }, tasa_valor: tasaValor, unidad: 'permil' }];
}

describe('incendio.calculator — Prima Técnica Mínima (piso Gs. 409.091, plan Edificio y Contenido)', () => {
  test('capital bajo: la prima tarifada cae por debajo del piso y se aplica Gs. 409.091', async () => {
    const resultado = await calcularPrima({
      plan: planEdificioContenido(),
      riesgoDatos: { rubro_actividad: 'Bazar', capital_edificio: 1_000_000, capital_contenido: 1_000_000 },
      rubro: rubroBase(),
      catalogoRamo: catalogoBase(),
      tasasRamo: [],
    });
    // costoEdificio = 1.000.000*2/1000 = 2000; costoContenido = 1.000.000*1.5/1000 = 1500
    // primaCalculada = 3500, muy por debajo del piso 409.091 → se aplica el piso.
    assert.equal(resultado.detalle.costo_edificio, 2000);
    assert.equal(resultado.detalle.costo_contenido, 1500);
    assert.equal(resultado.detalle.prima_base, PISO_EDIFICIO_CONTENIDO);
    assert.equal(resultado.prima, PISO_EDIFICIO_CONTENIDO);
  });

  test('capital alto: la prima tarifada supera el piso — el piso NO se aplica', async () => {
    const resultado = await calcularPrima({
      plan: planEdificioContenido(),
      riesgoDatos: { rubro_actividad: 'Bazar', capital_edificio: 500_000_000, capital_contenido: 300_000_000 },
      rubro: rubroBase(),
      catalogoRamo: catalogoBase(),
      tasasRamo: [],
    });
    // costoEdificio = 1.000.000; costoContenido = 450.000 → primaCalculada = 1.450.000 > piso.
    assert.equal(resultado.detalle.costo_edificio, 1_000_000);
    assert.equal(resultado.detalle.costo_contenido, 450_000);
    assert.equal(resultado.detalle.prima_base, 1_450_000);
    assert.notEqual(resultado.detalle.prima_base, PISO_EDIFICIO_CONTENIDO);
    assert.equal(resultado.prima, 1_450_000);
  });
});

describe('incendio.calculator — Maquinaria Básico (tasa fija 0,7%)', () => {
  test('costo de maquinaria = capital × 7‰ (0,7%)', async () => {
    const resultado = await calcularPrima({
      plan: planMaquinaria(),
      riesgoDatos: { capital_maquinaria: 100_000_000 },
      catalogoRamo: catalogoBase(),
      tasasRamo: tasasMaquinaria(7),
    });
    // costoMaquinaria = 100.000.000 * 7/1000 = 700.000 (0,7% de 100.000.000)
    assert.equal(resultado.detalle.costo_maquinaria, 700_000);
    assert.equal(resultado.detalle.costo_maquinaria, 100_000_000 * 0.007);
    assert.equal(resultado.prima, 700_000);
  });

  test('rechaza si falta la tasa de incendio_maquinaria en tasas_cobertura_ramo', async () => {
    await assert.rejects(
      () =>
        calcularPrima({
          plan: planMaquinaria(),
          riesgoDatos: { capital_maquinaria: 100_000_000 },
          catalogoRamo: catalogoBase(),
          tasasRamo: [],
        }),
      (err) => {
        assert.equal(err.status, 422);
        assert.match(err.message, /Falta la tasa de "incendio_maquinaria"/);
        return true;
      }
    );
  });
});

describe('incendio.calculator — calcularPlanPago — 4 formas de pago simultáneas', () => {
  const PRIMA = 1_450_000; // deliberadamente no-redondo para que el redondeo realmente aplique

  test('Contado: RPF=0%, inicial === premio, cuota === 0', () => {
    const resultado = calcularPlanPago(PRIMA, { codigo: 'contado', tasa_rpf: 0 }, 0);
    // iva = 1.450.000*0.10 = 145.000; premio_bruto = 1.595.000 (ya redondo)
    assert.equal(resultado.rpf, 0);
    assert.equal(resultado.iva, 145_000);
    assert.equal(resultado.premio, 1_595_000);
    assert.equal(resultado.inicial, resultado.premio);
    assert.equal(resultado.cuota, 0);
  });

  test('Cobrador: RPF fijo 1,6%', () => {
    const resultado = calcularPlanPago(PRIMA, { codigo: 'cobrador', tasa_rpf: 1.6 }, 0);
    // rpf_bruto = 1.450.000*0.016 = 23.200 (no es múltiplo de 1000) → redondea hacia ARRIBA a 24.000
    // iva = 145.000 + 24.000*0.10 = 147.400; premio_bruto = 1.450.000+24.000+147.400 = 1.621.400 → floor 1.621.000
    assert.equal(resultado.rpf, 24_000);
    assert.equal(resultado.iva, 147_400);
    assert.equal(resultado.premio, 1_621_000);
  });

  test('Boca de Cobranza: RPF fijo 1,35%', () => {
    const resultado = calcularPlanPago(PRIMA, { codigo: 'boca_cobranza', tasa_rpf: 1.35 }, 0);
    // rpf_bruto = 1.450.000*0.0135 = 19.575 → redondea hacia ARRIBA a 20.000
    // iva = 145.000 + 20.000*0.10 = 147.000; premio_bruto = 1.450.000+20.000+147.000 = 1.617.000 (ya redondo)
    assert.equal(resultado.rpf, 20_000);
    assert.equal(resultado.iva, 147_000);
    assert.equal(resultado.premio, 1_617_000);
  });

  test('Tarjeta de Crédito: RPF fijo 1%', () => {
    const resultado = calcularPlanPago(PRIMA, { codigo: 'tarjeta', tasa_rpf: 1 }, 0);
    // rpf_bruto = 1.450.000*0.01 = 14.500 → redondea hacia ARRIBA a 15.000
    // iva = 145.000 + 15.000*0.10 = 146.500; premio_bruto = 1.450.000+15.000+146.500 = 1.611.500 → floor 1.611.000
    assert.equal(resultado.rpf, 15_000);
    assert.equal(resultado.iva, 146_500);
    assert.equal(resultado.premio, 1_611_000);
  });
});

describe('incendio.calculator — redondeo e invariante Inicial + N×Cuota === Premio', () => {
  test('RPF redondea hacia ARRIBA cuando el bruto no es redondo (Boca de Cobranza)', () => {
    const resultado = calcularPlanPago(1_450_000, { codigo: 'boca_cobranza', tasa_rpf: 1.35 }, 0);
    assert.equal(resultado.rpf, 20_000);
    assert.notEqual(resultado.rpf, 19_000);
  });

  test('Cuota redondea hacia ABAJO y la invariante Inicial + N×Cuota === Premio se cumple exacto', () => {
    // premio = 1.617.000 (Boca de Cobranza), cuotas = 4 → 1.617.000/5 = 323.400 (no redondo)
    const resultado = calcularPlanPago(1_450_000, { codigo: 'boca_cobranza', tasa_rpf: 1.35 }, 4);
    assert.equal(resultado.premio, 1_617_000);
    assert.equal(resultado.cuota, 323_000);
    assert.notEqual(resultado.cuota, 324_000);
    assert.equal(resultado.inicial + 4 * resultado.cuota, resultado.premio);
  });
});

describe('incendio.calculator — casos de error explícitos', () => {
  test('rechaza si el plan no tiene prima_tecnica_minima confirmada', async () => {
    await assert.rejects(
      () =>
        calcularPrima({
          plan: planEdificioContenido({ prima_tecnica_minima: null }),
          riesgoDatos: { rubro_actividad: 'Bazar', capital_edificio: 1, capital_contenido: 1 },
          rubro: rubroBase(),
          catalogoRamo: catalogoBase(),
          tasasRamo: [],
        }),
      (err) => {
        assert.equal(err.status, 422);
        assert.match(err.message, /todavía no tiene RPF\/prima técnica mínima confirmados/);
        return true;
      }
    );
  });

  test('rechaza si el capital supera la responsabilidad máxima cotizable del plan', async () => {
    await assert.rejects(
      () =>
        calcularPrima({
          plan: planEdificioContenido({ responsabilidad_maxima_cotizable: 100_000_000 }),
          riesgoDatos: { rubro_actividad: 'Bazar', capital_edificio: 90_000_000, capital_contenido: 90_000_000 },
          rubro: rubroBase(),
          catalogoRamo: catalogoBase(),
          tasasRamo: [],
        }),
      (err) => {
        assert.equal(err.status, 422);
        assert.match(err.message, /supera la Responsabilidad Máx\. Cotizable/);
        return true;
      }
    );
  });

  test('rechaza si el rubro de actividad no se encontró', async () => {
    await assert.rejects(
      () =>
        calcularPrima({
          plan: planEdificioContenido(),
          riesgoDatos: { rubro_actividad: 'Rubro Inexistente', capital_edificio: 1_000_000, capital_contenido: 1_000_000 },
          rubro: null,
          catalogoRamo: catalogoBase(),
          tasasRamo: [],
        }),
      (err) => {
        assert.equal(err.status, 422);
        assert.match(err.message, /no encontrado en rubros_actividad/);
        return true;
      }
    );
  });
});
