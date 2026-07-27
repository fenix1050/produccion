import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { calcularPrima, calcularPlanPago } from './incendio.calculator.js'

// Verifica valores reales del motor de Incendio contra las reglas confirmadas en
// CLAUDE.md/PLAN_DESARROLLO.md: Prima Técnica Mínima real = Gs. 409.091 (plan Edificio y
// Contenido) y tasa fija 0,7% (Maquinaria Básico), más el motor compartido de RPF/IVA/Premio.

const PISO_EDIFICIO_CONTENIDO = 409_091

function planEdificioContenido(overrides = {}) {
  return {
    nombre: 'INCENDIO - EDIFICIO Y CONTENIDO',
    prima_tecnica_minima: PISO_EDIFICIO_CONTENIDO,
    responsabilidad_maxima_cotizable: 5_000_000_000,
    descuento_maximo: 20,
    recargo_maximo: 20,
    ...overrides,
  }
}

function planMaquinaria(overrides = {}) {
  return {
    nombre: 'MAQUINARIA BASICO',
    prima_tecnica_minima: 100,
    responsabilidad_maxima_cotizable: 5_000_000_000,
    descuento_maximo: 20,
    recargo_maximo: 20,
    ...overrides,
  }
}

function rubroBase(overrides = {}) {
  return { nombre: 'Bazar', tasa_edificio: 2, tasa_contenido: 1.5, ...overrides }
}

function catalogoBase() {
  return [
    { codigo: 'incendio_edificio', nombre: 'Incendio de Edificio', franquicia_default: null },
    { codigo: 'incendio_contenido', nombre: 'Incendio de Contenido', franquicia_default: null },
    { codigo: 'incendio_maquinaria', nombre: 'Incendio de Maquinaria', franquicia_default: null },
    { codigo: 'sublimite_fenomenos_naturales', nombre: 'Sublímite por Fenómenos Naturales' },
    { codigo: 'sublimite_vandalismo_maquinaria', nombre: 'Sublímite por Vandalismo (Maquinaria)' },
  ]
}

function tasasMaquinaria(tasaValor = 7) {
  return [
    {
      coberturas_catalogo: { codigo: 'incendio_maquinaria' },
      tasa_valor: tasaValor,
      unidad: 'permil',
    },
  ]
}

describe('incendio.calculator — Prima Técnica Mínima (piso Gs. 409.091, plan Edificio y Contenido)', () => {
  test('capital bajo: la prima tarifada cae por debajo del piso y se aplica Gs. 409.091', async () => {
    const resultado = await calcularPrima({
      plan: planEdificioContenido(),
      riesgoDatos: {
        rubro_actividad: 'Bazar',
        capital_edificio: 1_000_000,
        capital_contenido: 1_000_000,
      },
      rubro: rubroBase(),
      catalogoRamo: catalogoBase(),
      tasasRamo: [],
    })
    // costoEdificio = 1.000.000*2/1000 = 2000; costoContenido = 1.000.000*1.5/1000 = 1500
    // primaCalculada = 3500, muy por debajo del piso 409.091 → se aplica el piso.
    assert.equal(resultado.detalle.costo_edificio, 2000)
    assert.equal(resultado.detalle.costo_contenido, 1500)
    assert.equal(resultado.detalle.prima_base, PISO_EDIFICIO_CONTENIDO)
    assert.equal(resultado.prima, PISO_EDIFICIO_CONTENIDO)
  })

  test('capital alto: la prima tarifada supera el piso — el piso NO se aplica', async () => {
    const resultado = await calcularPrima({
      plan: planEdificioContenido(),
      riesgoDatos: {
        rubro_actividad: 'Bazar',
        capital_edificio: 500_000_000,
        capital_contenido: 300_000_000,
      },
      rubro: rubroBase(),
      catalogoRamo: catalogoBase(),
      tasasRamo: [],
    })
    // costoEdificio = 1.000.000; costoContenido = 450.000 → primaCalculada = 1.450.000 > piso.
    assert.equal(resultado.detalle.costo_edificio, 1_000_000)
    assert.equal(resultado.detalle.costo_contenido, 450_000)
    assert.equal(resultado.detalle.prima_base, 1_450_000)
    assert.notEqual(resultado.detalle.prima_base, PISO_EDIFICIO_CONTENIDO)
    assert.equal(resultado.prima, 1_450_000)
  })
})

describe('incendio.calculator — Maquinaria Básico (tasa fija 0,7%)', () => {
  test('costo de maquinaria = capital × 7‰ (0,7%)', async () => {
    const resultado = await calcularPrima({
      plan: planMaquinaria(),
      riesgoDatos: { capital_maquinaria: 100_000_000 },
      catalogoRamo: catalogoBase(),
      tasasRamo: tasasMaquinaria(7),
    })
    // costoMaquinaria = 100.000.000 * 7/1000 = 700.000 (0,7% de 100.000.000)
    assert.equal(resultado.detalle.costo_maquinaria, 700_000)
    assert.equal(resultado.detalle.costo_maquinaria, 100_000_000 * 0.007)
    assert.equal(resultado.prima, 700_000)
  })

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
        assert.equal(err.status, 422)
        assert.match(err.message, /Falta la tasa de "incendio_maquinaria"/)
        return true
      }
    )
  })
})

describe('incendio.calculator — calcularPlanPago — 4 formas de pago simultáneas', () => {
  const PRIMA = 1_450_000 // deliberadamente no-redondo para que el redondeo realmente aplique

  test('Contado: RPF=0%, inicial === premio, cuota === 0', () => {
    const resultado = calcularPlanPago(PRIMA, { codigo: 'contado', tasa_rpf: 0 }, 0)
    // iva = 1.450.000*0.10 = 145.000; premio_bruto = 1.595.000 (ya redondo)
    assert.equal(resultado.rpf, 0)
    assert.equal(resultado.iva, 145_000)
    assert.equal(resultado.premio, 1_595_000)
    assert.equal(resultado.inicial, resultado.premio)
    assert.equal(resultado.cuota, 0)
  })

  test('Cobrador: RPF fijo 1,6%', () => {
    const resultado = calcularPlanPago(PRIMA, { codigo: 'cobrador', tasa_rpf: 1.6 }, 0)
    // rpf_bruto = 1.450.000*0.016 = 23.200 (no es múltiplo de 1000) → redondea hacia ARRIBA a 24.000
    // iva = 145.000 + 24.000*0.10 = 147.400; premio_bruto = 1.450.000+24.000+147.400 = 1.621.400 → floor 1.621.000
    assert.equal(resultado.rpf, 24_000)
    assert.equal(resultado.iva, 147_400)
    assert.equal(resultado.premio, 1_621_000)
  })

  test('Boca de Cobranza: RPF fijo 1,35%', () => {
    const resultado = calcularPlanPago(PRIMA, { codigo: 'boca_cobranza', tasa_rpf: 1.35 }, 0)
    // rpf_bruto = 1.450.000*0.0135 = 19.575 → redondea hacia ARRIBA a 20.000
    // iva = 145.000 + 20.000*0.10 = 147.000; premio_bruto = 1.450.000+20.000+147.000 = 1.617.000 (ya redondo)
    assert.equal(resultado.rpf, 20_000)
    assert.equal(resultado.iva, 147_000)
    assert.equal(resultado.premio, 1_617_000)
  })

  test('Tarjeta de Crédito: RPF fijo 1%', () => {
    const resultado = calcularPlanPago(PRIMA, { codigo: 'tarjeta', tasa_rpf: 1 }, 0)
    // rpf_bruto = 1.450.000*0.01 = 14.500 → redondea hacia ARRIBA a 15.000
    // iva = 145.000 + 15.000*0.10 = 146.500; premio_bruto = 1.450.000+15.000+146.500 = 1.611.500 → floor 1.611.000
    assert.equal(resultado.rpf, 15_000)
    assert.equal(resultado.iva, 146_500)
    assert.equal(resultado.premio, 1_611_000)
  })
})

describe('incendio.calculator — redondeo e invariante Inicial + N×Cuota === Premio', () => {
  test('RPF redondea hacia ARRIBA cuando el bruto no es redondo (Boca de Cobranza)', () => {
    const resultado = calcularPlanPago(1_450_000, { codigo: 'boca_cobranza', tasa_rpf: 1.35 }, 0)
    assert.equal(resultado.rpf, 20_000)
    assert.notEqual(resultado.rpf, 19_000)
  })

  test('Cuota redondea hacia ABAJO y la invariante Inicial + N×Cuota === Premio se cumple exacto', () => {
    // premio = 1.617.000 (Boca de Cobranza), cuotas = 4 → 1.617.000/5 = 323.400 (no redondo)
    const resultado = calcularPlanPago(1_450_000, { codigo: 'boca_cobranza', tasa_rpf: 1.35 }, 4)
    assert.equal(resultado.premio, 1_617_000)
    assert.equal(resultado.cuota, 323_000)
    assert.notEqual(resultado.cuota, 324_000)
    assert.equal(resultado.inicial + 4 * resultado.cuota, resultado.premio)
  })
})

// --- Tercera mecánica: "objeto_riesgo" (planes Hipotecario, con/sin Inspección) ---
// A diferencia de las 2 mecánicas anteriores, las tasas NO vienen de rubro/tasasRamo sino de
// `tasasObjetoRiesgo` (resuelto por cotizacion.service.js vía coberturas.repository —
// findTasasRiesgoObjeto), con la forma:
//   { tipo_riesgo: {nombre, tasa_global, tasa_minima, tasa_maxima, unidad},
//     objetos: { edificio: {tasa_valor, unidad}, instalaciones: {...}, ... } }

function planObjetoRiesgo(overrides = {}) {
  return {
    nombre: 'INCENDIO CON INSPECCION',
    tipo_mecanica: 'objeto_riesgo',
    prima_tecnica_minima: 100,
    prima_tecnica_minima_usd: 50,
    responsabilidad_maxima_cotizable: 5_000_000_000,
    descuento_maximo: 20,
    recargo_maximo: 20,
    ...overrides,
  }
}

function tasasObjetoRiesgoBase(overrides = {}) {
  return {
    tipo_riesgo: {
      nombre: 'VIVIENDA FAMILIAR',
      tasa_global: 2.24,
      tasa_minima: 0.6,
      tasa_maxima: 35.48,
      unidad: 'porcentaje',
    },
    objetos: {
      edificio: { tasa_valor: 0.9, unidad: 'porcentaje' },
      instalaciones: { tasa_valor: 0.9, unidad: 'porcentaje' },
      contenido_mueble_equipos: { tasa_valor: 1.34, unidad: 'porcentaje' },
      contenido_mercaderia: { tasa_valor: 1.34, unidad: 'porcentaje' },
    },
    ...overrides,
  }
}

function catalogoObjetoRiesgo() {
  return [
    { codigo: 'incendio_edificio', nombre: 'Incendio de Edificio', franquicia_default: null },
    {
      codigo: 'incendio_instalaciones',
      nombre: 'Incendio de Instalaciones',
      franquicia_default: null,
    },
    {
      codigo: 'incendio_contenido_mueble_equipos',
      nombre: 'Incendio de Contenido Mueble y Equipos',
      franquicia_default: null,
    },
    {
      codigo: 'incendio_contenido_mercaderia',
      nombre: 'Incendio de Contenido Mercadería',
      franquicia_default: null,
    },
  ]
}

describe('incendio.calculator — mecánica "objeto_riesgo" (Hipotecario / con-sin Inspección)', () => {
  test('prima con los 4 objetos de riesgo declarados: suma de cada capital × tasa del objeto', async () => {
    const resultado = await calcularPrima({
      plan: planObjetoRiesgo(),
      riesgoDatos: {
        capital_edificio: 100_000_000,
        capital_instalaciones: 100_000_000,
        capital_contenido_mueble_equipos: 100_000_000,
        capital_contenido_mercaderia: 100_000_000,
      },
      catalogoRamo: catalogoObjetoRiesgo(),
      tasasObjetoRiesgo: tasasObjetoRiesgoBase(),
    })
    // costo = 100M*0.9% + 100M*0.9% + 100M*1.34% + 100M*1.34% = 900k+900k+1.34M+1.34M = 4.48M
    assert.equal(resultado.detalle.costo_edificio, 900_000)
    assert.equal(resultado.detalle.costo_instalaciones, 900_000)
    assert.equal(resultado.detalle.costo_contenido_mueble_equipos, 1_340_000)
    assert.equal(resultado.detalle.costo_contenido_mercaderia, 1_340_000)
    assert.equal(resultado.prima, 4_480_000)
    assert.equal(resultado.coberturas.length, 4)
  })

  test('objeto no declarado no suma a la prima (solo 2 de 4 declarados)', async () => {
    const resultado = await calcularPrima({
      plan: planObjetoRiesgo(),
      riesgoDatos: {
        capital_edificio: 100_000_000,
        capital_instalaciones: 100_000_000,
      },
      catalogoRamo: catalogoObjetoRiesgo(),
      tasasObjetoRiesgo: tasasObjetoRiesgoBase(),
    })
    // costo = 900k + 900k = 1.8M — sin contenido mueble/mercadería
    assert.equal(resultado.prima, 1_800_000)
    assert.equal(resultado.coberturas.length, 2)
    assert.equal(resultado.detalle.costo_contenido_mueble_equipos, undefined)
    assert.equal(resultado.detalle.costo_contenido_mercaderia, undefined)
  })

  test('sin ningún objeto de riesgo declarado rechaza con 422', async () => {
    await assert.rejects(
      () =>
        calcularPrima({
          plan: planObjetoRiesgo(),
          riesgoDatos: {},
          catalogoRamo: catalogoObjetoRiesgo(),
          tasasObjetoRiesgo: tasasObjetoRiesgoBase(),
        }),
      (err) => {
        assert.equal(err.status, 422)
        assert.match(err.message, /al menos un objeto de riesgo/)
        return true
      }
    )
  })

  test('tipo de riesgo sin tasas confirmadas rechaza con 422', async () => {
    await assert.rejects(
      () =>
        calcularPrima({
          plan: planObjetoRiesgo(),
          riesgoDatos: { capital_edificio: 100_000_000 },
          catalogoRamo: catalogoObjetoRiesgo(),
          tasasObjetoRiesgo: null,
        }),
      (err) => {
        assert.equal(err.status, 422)
        assert.match(err.message, /Tipo de Riesgo/)
        return true
      }
    )
  })

  test('suma declarada supera la Responsabilidad Máx. Cotizable rechaza con 422', async () => {
    await assert.rejects(
      () =>
        calcularPrima({
          plan: planObjetoRiesgo({ responsabilidad_maxima_cotizable: 50_000_000 }),
          riesgoDatos: { capital_edificio: 100_000_000 },
          catalogoRamo: catalogoObjetoRiesgo(),
          tasasObjetoRiesgo: tasasObjetoRiesgoBase(),
        }),
      (err) => {
        assert.equal(err.status, 422)
        assert.match(err.message, /supera la Responsabilidad Máx\. Cotizable/)
        return true
      }
    )
  })

  test('tasa efectiva bajo tasa_minima del tipo de riesgo: se aplica el piso (clamp)', async () => {
    const resultado = await calcularPrima({
      plan: planObjetoRiesgo(),
      riesgoDatos: {
        capital_edificio: 100_000_000,
        capital_instalaciones: 100_000_000,
        capital_contenido_mueble_equipos: 100_000_000,
        capital_contenido_mercaderia: 100_000_000,
      },
      catalogoRamo: catalogoObjetoRiesgo(),
      // tasa_minima 2% > tasa efectiva real (4.48M/400M = 1.12%) → debe aplicarse el clamp
      tasasObjetoRiesgo: tasasObjetoRiesgoBase({
        tipo_riesgo: {
          nombre: 'VIVIENDA FAMILIAR',
          tasa_global: 2.24,
          tasa_minima: 2,
          tasa_maxima: 35.48,
          unidad: 'porcentaje',
        },
      }),
    })
    // clamp: 400M × 2% = 8.000.000, en vez de los 4.480.000 sin clamp
    assert.equal(resultado.prima, 8_000_000)
    assert.notEqual(resultado.prima, 4_480_000)
  })

  test('"sin Inspección" con suma ≥ umbral rechaza con 422', async () => {
    await assert.rejects(
      () =>
        calcularPrima({
          plan: planObjetoRiesgo({ nombre: 'INCENDIO SIN INSPECCION' }),
          riesgoDatos: { capital_edificio: 800_000_000 },
          catalogoRamo: catalogoObjetoRiesgo(),
          tasasObjetoRiesgo: tasasObjetoRiesgoBase(),
          umbralInspeccion: { requiereInspeccion: false, montoEnMonedaCotizacion: 700_000_000 },
        }),
      (err) => {
        assert.equal(err.status, 422)
        assert.match(err.message, /Incendio con Inspección/)
        return true
      }
    )
  })

  test('"con Inspección" con suma ≥ umbral es aceptada (no rechaza)', async () => {
    const resultado = await calcularPrima({
      plan: planObjetoRiesgo({ nombre: 'INCENDIO CON INSPECCION' }),
      riesgoDatos: { capital_edificio: 800_000_000 },
      catalogoRamo: catalogoObjetoRiesgo(),
      tasasObjetoRiesgo: tasasObjetoRiesgoBase(),
      umbralInspeccion: { requiereInspeccion: true, montoEnMonedaCotizacion: 700_000_000 },
    })
    assert.equal(resultado.detalle.suma_asegurada_total, 800_000_000)
  })

  test('Hipotecario exento del umbral en cualquier suma (umbralInspeccion=null, no aplica)', async () => {
    const resultado = await calcularPrima({
      plan: planObjetoRiesgo({ nombre: 'INCENDIO HIPOTECARIO' }),
      riesgoDatos: { capital_edificio: 5_000_000_000 - 1 },
      catalogoRamo: catalogoObjetoRiesgo(),
      tasasObjetoRiesgo: tasasObjetoRiesgoBase(),
      umbralInspeccion: null,
    })
    assert.equal(resultado.detalle.suma_asegurada_total, 5_000_000_000 - 1)
  })

  test('piso prima_tecnica_minima en PYG se aplica cuando la prima calculada es menor', async () => {
    const resultado = await calcularPrima({
      plan: planObjetoRiesgo({ prima_tecnica_minima: 2_000_000 }),
      riesgoDatos: { capital_edificio: 1_000_000 },
      catalogoRamo: catalogoObjetoRiesgo(),
      tasasObjetoRiesgo: tasasObjetoRiesgoBase(),
    })
    // costo real: 1.000.000*0.9% = 9.000, muy por debajo del piso 2.000.000
    assert.equal(resultado.prima, 2_000_000)
  })

  test('piso prima_tecnica_minima_usd se aplica cuando la cotización es en USD (piso distinto al de PYG)', async () => {
    const resultado = await calcularPrima({
      plan: planObjetoRiesgo({ prima_tecnica_minima: 2_000_000, prima_tecnica_minima_usd: 300 }),
      riesgoDatos: { capital_edificio: 1_000 },
      catalogoRamo: catalogoObjetoRiesgo(),
      tasasObjetoRiesgo: tasasObjetoRiesgoBase(),
      moneda: 'USD',
    })
    // costo real: 1.000*0.9% = 9, muy por debajo del piso USD 300 (y del piso PYG 2.000.000)
    assert.equal(resultado.prima, 300)
  })

  test('USD sin piso prima_tecnica_minima_usd cargado rechaza con 422', async () => {
    await assert.rejects(
      () =>
        calcularPrima({
          plan: planObjetoRiesgo({ prima_tecnica_minima_usd: null }),
          riesgoDatos: { capital_edificio: 1_000_000 },
          catalogoRamo: catalogoObjetoRiesgo(),
          tasasObjetoRiesgo: tasasObjetoRiesgoBase(),
          moneda: 'USD',
        }),
      (err) => {
        assert.equal(err.status, 422)
        assert.match(err.message, /USD/)
        return true
      }
    )
  })

  test('dispatch usa plan.tipo_mecanica explícito, sin importar plan.nombre', async () => {
    const resultado = await calcularPrima({
      plan: planObjetoRiesgo({ nombre: 'CUALQUIER NOMBRE', tipo_mecanica: 'objeto_riesgo' }),
      riesgoDatos: { capital_edificio: 100_000_000 },
      catalogoRamo: catalogoObjetoRiesgo(),
      tasasObjetoRiesgo: tasasObjetoRiesgoBase(),
    })
    assert.equal(resultado.detalle.costo_edificio, 900_000)
  })

  test('dispatch cae a "maquinaria" por nombre cuando tipo_mecanica es NULL (columna no poblada aún)', async () => {
    const resultado = await calcularPrima({
      plan: planMaquinaria({ tipo_mecanica: null }),
      riesgoDatos: { capital_maquinaria: 100_000_000 },
      catalogoRamo: catalogoBase(),
      tasasRamo: tasasMaquinaria(7),
    })
    assert.equal(resultado.detalle.costo_maquinaria, 700_000)
  })
})

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
        assert.equal(err.status, 422)
        assert.match(err.message, /todavía no tiene RPF\/prima técnica mínima confirmados/)
        return true
      }
    )
  })

  test('rechaza si el capital supera la responsabilidad máxima cotizable del plan', async () => {
    await assert.rejects(
      () =>
        calcularPrima({
          plan: planEdificioContenido({ responsabilidad_maxima_cotizable: 100_000_000 }),
          riesgoDatos: {
            rubro_actividad: 'Bazar',
            capital_edificio: 90_000_000,
            capital_contenido: 90_000_000,
          },
          rubro: rubroBase(),
          catalogoRamo: catalogoBase(),
          tasasRamo: [],
        }),
      (err) => {
        assert.equal(err.status, 422)
        assert.match(err.message, /supera la Responsabilidad Máx\. Cotizable/)
        return true
      }
    )
  })

  test('rechaza si el rubro de actividad no se encontró', async () => {
    await assert.rejects(
      () =>
        calcularPrima({
          plan: planEdificioContenido(),
          riesgoDatos: {
            rubro_actividad: 'Rubro Inexistente',
            capital_edificio: 1_000_000,
            capital_contenido: 1_000_000,
          },
          rubro: null,
          catalogoRamo: catalogoBase(),
          tasasRamo: [],
        }),
      (err) => {
        assert.equal(err.status, 422)
        assert.match(err.message, /no encontrado en rubros_actividad/)
        return true
      }
    )
  })
})
