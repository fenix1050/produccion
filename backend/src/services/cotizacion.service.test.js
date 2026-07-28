import assert from 'node:assert/strict'
import { test } from 'node:test'

import { invalidarCacheCatalogos } from './cache.js'

// Tests de integración del service de cotización (grupo 5/7 de "incendio-3-planes-y-moneda"):
// moneda + snapshot de tipo de cambio (persistido SOLO al emitir, nunca en preview) y resolución
// de tasa por objeto de riesgo con override por plan. Repositories y `tipo-cambio.service.js`
// mockeados vía `t.mock.module` (mismo patrón que `admin/roles.service.test.js` /
// `admin/usuarios.service.test.js`) — cache-busting con query string en cada import dinámico
// para que `cotizacion.service.js` se reevalúe contra el mock de ESE test.

const PLAN_OBJETO_RIESGO = {
  id: 10,
  ramo_id: 1,
  nombre: 'INCENDIO CON INSPECCION',
  tipo_mecanica: 'objeto_riesgo',
  requiere_inspeccion: true,
  umbral_inspeccion_monto: 1_000_000,
  umbral_inspeccion_moneda: 'PYG',
  prima_tecnica_minima: 100,
  prima_tecnica_minima_usd: 50,
  responsabilidad_maxima_cotizable: 999_999_999_999,
  descuento_maximo: 20,
  recargo_maximo: 20,
  cuotas_default: 1,
}

const RAMO_INCENDIO = { id: 1, nombre: 'incendio', calculador: 'incendio', activo: true }

const TASAS_OBJETO_RIESGO_VIVIENDA_FAMILIAR = {
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
}

const FORMAS_PAGO_CONTADO = [
  { forma_pago_id: 1, tasa_rpf: 0, formas_pago: { codigo: 'contado', nombre_display: 'Contado' } },
]

function mockearRepositorios(
  t,
  {
    plan = PLAN_OBJETO_RIESGO,
    ramo = RAMO_INCENDIO,
    tasasObjetoRiesgo = TASAS_OBJETO_RIESGO_VIVIENDA_FAMILIAR,
    tipoCambio = {
      venta: 7300.75,
      compra: 7250.5,
      obtenido_en: '2026-07-27T00:00:00Z',
      fuente: 'dolarpy:set',
      origen: 'api',
      stale: false,
    },
    insertados = {},
  } = {}
) {
  const cotizacionesInsertadas = []
  const cotizacionesActualizadas = []

  t.mock.module('../repositories/ramos.repository.js', {
    exports: {
      findPlanById: async () => plan,
      findRamoById: async () => ramo,
      findFormasPagoDelPlan: async () => FORMAS_PAGO_CONTADO,
      findCoberturasByPlanId: async () => [],
    },
  })

  t.mock.module('../repositories/coberturas.repository.js', {
    exports: {
      findRubroPorNombre: async () => null,
      findCoberturasCatalogoByRamoId: async () => [
        { codigo: 'incendio_edificio', nombre: 'Incendio de Edificio', franquicia_default: null },
      ],
      findTasasCoberturaRamo: async () => [],
      findTasasRiesgoObjeto: async () => tasasObjetoRiesgo,
    },
  })

  t.mock.module('../repositories/cotizaciones.repository.js', {
    exports: {
      nextNumeroCorrelativo: async () => 1,
      insertCotizacion: async (cotizacion) => {
        const fila = { id: 99, ...cotizacion }
        cotizacionesInsertadas.push(fila)
        return fila
      },
      updateCotizacion: async (id, cambios) => {
        const fila = { id, ...cambios }
        cotizacionesActualizadas.push(fila)
        return fila
      },
      findCotizacionById: async (id) => ({ id, ...insertados }),
      insertCoberturas: async () => [],
      insertVariante: async () => ({ id: 1 }),
      insertPlanesPago: async () => [],
      insertAjustes: async () => [],
      deleteVariantesByIds: async () => {},
      deleteCoberturasByIds: async () => {},
    },
  })

  t.mock.module('./tipo-cambio.service.js', {
    exports: {
      obtenerTipoCambioVigente: async () => tipoCambio,
      registrarTipoCambioManual: async () => {},
    },
  })

  return { cotizacionesInsertadas, cotizacionesActualizadas }
}

const USUARIO = { id: 1, rol: 'agente' }

function bodyBase(overrides = {}) {
  return {
    plan_id: PLAN_OBJETO_RIESGO.id,
    riesgo_datos: { rubro_actividad: 'VIVIENDA FAMILIAR', capital_edificio: 1_000_000 },
    capital_asegurado: 0,
    cliente_nombre: 'Cliente Test',
    moneda: 'PYG',
    ...overrides,
  }
}

test('crearCotizacion con moneda:USD persiste moneda + snapshot de tipo de cambio', async (t) => {
  invalidarCacheCatalogos()
  const { cotizacionesInsertadas } = mockearRepositorios(t)
  const { crearCotizacion } = await import('./cotizacion.service.js?case=crear-usd-snapshot')

  await crearCotizacion(bodyBase({ moneda: 'USD' }), USUARIO)

  assert.equal(cotizacionesInsertadas.length, 1)
  const fila = cotizacionesInsertadas[0]
  assert.equal(fila.moneda, 'USD')
  assert.equal(fila.tipo_cambio_snapshot, 7300.75)
  assert.equal(fila.tipo_cambio_fuente, 'dolarpy:set')
  assert.equal(fila.tipo_cambio_fecha, '2026-07-27T00:00:00Z')
})

test('crearCotizacion en la misma moneda del umbral no invoca tipo de cambio ni persiste snapshot', async (t) => {
  invalidarCacheCatalogos()
  const { cotizacionesInsertadas } = mockearRepositorios(t)
  const { crearCotizacion } = await import('./cotizacion.service.js?case=crear-misma-moneda')

  await crearCotizacion(bodyBase({ moneda: 'PYG' }), USUARIO)

  assert.equal(cotizacionesInsertadas.length, 1)
  const fila = cotizacionesInsertadas[0]
  assert.equal(fila.moneda, 'PYG')
  assert.equal(fila.tipo_cambio_snapshot, undefined)
  assert.equal(fila.tipo_cambio_fuente, undefined)
  assert.equal(fila.tipo_cambio_fecha, undefined)
})

test('calcularPreview no persiste nada (nunca invoca insertCotizacion)', async (t) => {
  invalidarCacheCatalogos()
  const { cotizacionesInsertadas } = mockearRepositorios(t)
  const { calcularPreview } = await import('./cotizacion.service.js?case=preview-no-persiste')

  const resultado = await calcularPreview(bodyBase({ moneda: 'USD' }), USUARIO)

  assert.ok(resultado.prima > 0)
  assert.equal(cotizacionesInsertadas.length, 0, 'el preview nunca debe llegar a insertCotizacion')
})

test('resolución de tasa por objeto de riesgo con override de plan gana sobre la tasa genérica', async (t) => {
  invalidarCacheCatalogos()
  const tasasConOverride = {
    tipo_riesgo: TASAS_OBJETO_RIESGO_VIVIENDA_FAMILIAR.tipo_riesgo,
    objetos: {
      // Simula lo que findTasasRiesgoObjeto ya devolvería resuelto: el override de ESTE plan
      // (0.5%) gana sobre la tasa genérica (0.9%) para "edificio".
      edificio: { tasa_valor: 0.5, unidad: 'porcentaje' },
      instalaciones: { tasa_valor: 0.9, unidad: 'porcentaje' },
      contenido_mueble_equipos: { tasa_valor: 1.34, unidad: 'porcentaje' },
      contenido_mercaderia: { tasa_valor: 1.34, unidad: 'porcentaje' },
    },
  }
  mockearRepositorios(t, { tasasObjetoRiesgo: tasasConOverride })
  const { calcularPreview } = await import('./cotizacion.service.js?case=override-plan')

  const resultado = await calcularPreview(
    bodyBase({
      moneda: 'PYG',
      riesgo_datos: { rubro_actividad: 'VIVIENDA FAMILIAR', capital_edificio: 1_000_000 },
    }),
    USUARIO
  )

  // 1.000.000 × 0.5% = 5.000 (con el override) en vez de 1.000.000 × 0.9% = 9.000 (genérica)
  assert.equal(resultado.detalle.costo_edificio, 5_000)
})

test('crearCotizacion borra la cabecera recién creada y re-lanza el error original si insertarCoberturasYVariantes falla', async (t) => {
  invalidarCacheCatalogos()

  const errorOriginal = new Error('duplicate key value violates unique constraint')
  const cotizacionesInsertadas = []
  const idsBorrados = []
  let llamadasCorrelativo = 0

  t.mock.module('../repositories/ramos.repository.js', {
    exports: {
      findPlanById: async () => PLAN_OBJETO_RIESGO,
      findRamoById: async () => RAMO_INCENDIO,
      findFormasPagoDelPlan: async () => FORMAS_PAGO_CONTADO,
      findCoberturasByPlanId: async () => [],
    },
  })

  t.mock.module('../repositories/coberturas.repository.js', {
    exports: {
      findRubroPorNombre: async () => null,
      findCoberturasCatalogoByRamoId: async () => [
        { codigo: 'incendio_edificio', nombre: 'Incendio de Edificio', franquicia_default: null },
      ],
      findTasasCoberturaRamo: async () => [],
      findTasasRiesgoObjeto: async () => TASAS_OBJETO_RIESGO_VIVIENDA_FAMILIAR,
    },
  })

  t.mock.module('./tipo-cambio.service.js', {
    exports: {
      obtenerTipoCambioVigente: async () => ({
        venta: 7300.75,
        compra: 7250.5,
        obtenido_en: '2026-07-27T00:00:00Z',
        fuente: 'dolarpy:set',
        origen: 'api',
        stale: false,
      }),
      registrarTipoCambioManual: async () => {},
    },
  })

  t.mock.module('../repositories/cotizaciones.repository.js', {
    exports: {
      // 1ra llamada: numero_cotizacion del header (crearCotizacion, línea ~40) — debe resolver OK.
      // 2da llamada: numero_variante dentro de insertarCoberturasYVariantes — acá reproducimos el
      // duplicate-key del Bug 1 (mismo valor de correlativo colisionando entre ramos).
      nextNumeroCorrelativo: async () => {
        llamadasCorrelativo += 1
        if (llamadasCorrelativo === 1) return 1
        throw errorOriginal
      },
      insertCotizacion: async (cotizacion) => {
        const fila = { id: 99, ...cotizacion }
        cotizacionesInsertadas.push(fila)
        return fila
      },
      deleteCotizacion: async (id) => {
        idsBorrados.push(id)
      },
      findCotizacionById: async (id) => ({ id }),
      insertCoberturas: async () => [],
      insertVariante: async () => ({ id: 1 }),
      insertPlanesPago: async () => [],
      insertAjustes: async () => [],
      deleteVariantesByIds: async () => {},
      deleteCoberturasByIds: async () => {},
    },
  })

  const { crearCotizacion } = await import('./cotizacion.service.js?case=crear-rollback-error')

  await assert.rejects(
    () => crearCotizacion(bodyBase({ moneda: 'PYG' }), USUARIO),
    (err) => {
      assert.equal(err, errorOriginal, 'debe re-lanzar el error original sin envolverlo')
      return true
    }
  )

  assert.equal(cotizacionesInsertadas.length, 1)
  assert.deepEqual(idsBorrados, [99], 'debe borrar la cabecera recién creada exactamente una vez')
})

test('actualizarCotizacion con nueva moneda:USD persiste moneda + snapshot en el UPDATE', async (t) => {
  invalidarCacheCatalogos()
  const cotizacionExistente = {
    id: 5,
    ramo_id: RAMO_INCENDIO.id,
    agente_id: USUARIO.id,
    created_at: new Date().toISOString(),
    cotizacion_variantes: [],
    cotizacion_coberturas: [],
  }

  t.mock.module('../repositories/ramos.repository.js', {
    exports: {
      findPlanById: async () => PLAN_OBJETO_RIESGO,
      findRamoById: async () => RAMO_INCENDIO,
      findFormasPagoDelPlan: async () => FORMAS_PAGO_CONTADO,
      findCoberturasByPlanId: async () => [],
    },
  })

  t.mock.module('../repositories/coberturas.repository.js', {
    exports: {
      findRubroPorNombre: async () => null,
      findCoberturasCatalogoByRamoId: async () => [
        { codigo: 'incendio_edificio', nombre: 'Incendio de Edificio', franquicia_default: null },
      ],
      findTasasCoberturaRamo: async () => [],
      findTasasRiesgoObjeto: async () => TASAS_OBJETO_RIESGO_VIVIENDA_FAMILIAR,
    },
  })

  t.mock.module('./tipo-cambio.service.js', {
    exports: {
      obtenerTipoCambioVigente: async () => ({
        venta: 7300.75,
        compra: 7250.5,
        obtenido_en: '2026-07-27T00:00:00Z',
        fuente: 'dolarpy:set',
        origen: 'api',
        stale: false,
      }),
      registrarTipoCambioManual: async () => {},
    },
  })

  const cotizacionesActualizadas = []
  t.mock.module('../repositories/cotizaciones.repository.js', {
    exports: {
      nextNumeroCorrelativo: async () => 1,
      findCotizacionById: async () => cotizacionExistente,
      updateCotizacion: async (id, cambios) => {
        const fila = { id, ...cambios }
        cotizacionesActualizadas.push(fila)
        return fila
      },
      insertCoberturas: async () => [],
      insertVariante: async () => ({ id: 1 }),
      insertPlanesPago: async () => [],
      insertAjustes: async () => [],
      deleteVariantesByIds: async () => {},
      deleteCoberturasByIds: async () => {},
      insertCotizacion: async () => {
        throw new Error('actualizarCotizacion no debe llamar a insertCotizacion')
      },
    },
  })
  const { actualizarCotizacion } =
    await import('./cotizacion.service.js?case=actualizar-usd-snapshot')

  await actualizarCotizacion(5, bodyBase({ moneda: 'USD' }), USUARIO)

  assert.equal(cotizacionesActualizadas.length, 1)
  assert.equal(cotizacionesActualizadas[0].moneda, 'USD')
  assert.equal(cotizacionesActualizadas[0].tipo_cambio_snapshot, 7300.75)
})
