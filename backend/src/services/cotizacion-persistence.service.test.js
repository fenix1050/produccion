import assert from 'node:assert/strict'
import { test } from 'node:test'

import { invalidarCacheCatalogos } from './cache.js'

// Estado compartido consumido por los mocks de `ramos.repository.js`/`coberturas.repository.js`
// registrados más abajo. Desde el split `cotizacion-service-split` (PR2/PR4),
// `validarYResolverContexto`/`resolverContextoRepositorios` viven en `cotizacion-context.service.js`
// — un módulo con specifier ESTABLE (sin query string) que `cotizacion-persistence.service.js`
// importa de forma estática. Node solo evalúa ese módulo UNA vez por proceso de test (la primera
// vez que se importa, en este archivo eso ocurre durante el primer test, dentro de
// `mockearRepositorios`) — su propio `import * as ramosRepository from '../repositories/
// ramos.repository.js'` queda atado PARA SIEMPRE al mock que esté activo en ESE momento, sin
// importar qué `t.mock.module` registre un test posterior (mismo hallazgo que PR1/PR3a en
// `cotizacion.service.test.js`). Por eso `mockearRepositorios` no puede registrar funciones
// "fijas" para esos dos repositories: expone funciones puente que leen `contextoRepoState` en el
// momento de la LLAMADA (no de la importación), y `sincronizarContextoRepoState` actualiza este
// objeto antes de cada test.
const contextoRepoState = {
  ramos: {},
  coberturas: {},
}

function sincronizarContextoRepoState({ ramos = {}, coberturas = {} } = {}) {
  contextoRepoState.ramos = ramos
  contextoRepoState.coberturas = coberturas
}

// Tests de integración de `cotizacion-persistence.service.js` (relocados desde
// `cotizacion.service.test.js` en PR 4 del cambio `cotizacion-service-split`): moneda + snapshot
// de tipo de cambio (persistido SOLO al emitir, nunca en preview), resolución de tasa por objeto
// de riesgo con override por plan, y passthrough del error original del RPC atómico sin
// compensación manual. Repositories y `tipo-cambio.service.js` mockeados vía `t.mock.module`
// (mismo patrón que `cotizacion.service.test.js`) — cache-busting con query string en cada import
// dinámico para que `cotizacion-persistence.service.js` se reevalúe contra el mock de ESE test.

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
  // Cambio SDD `cotizacion-transaccional` (PR2, Phase 2 RED): `insertCotizacion` /
  // `nextNumeroCorrelativo` / `insertVariante` / `insertPlanesPago` / `insertCoberturas` /
  // `insertAjustes` / `updateCotizacion` / `deleteVariantesByIds` / `deleteCoberturasByIds` dejan
  // de existir como exports del repository — el servicio pasa a llamar UNA sola vez a
  // `crearCotizacionAtomica(payload)` / `actualizarCotizacionAtomica(payload)`, cada una un thin
  // wrapper de `supabase.rpc('crear_cotizacion_atomica'|'actualizar_cotizacion_atomica', payload)`
  // (ver design.md — Interfaces/Contracts). El payload capturado acá es exactamente el argumento
  // que el servicio le pasa al repository — mismas keys `p_*` que el RPC de Postgres espera, para
  // que el servicio no tenga que traducir dos veces la misma forma.
  const cotizacionesCreadas = []
  const cotizacionesActualizadas = []

  // Ver nota grande al inicio del archivo: puente hacia `contextoRepoState` en vez de funciones
  // fijas, porque `cotizacion-context.service.js` (specifier estable) se congela con el PRIMER
  // `t.mock.module` de estos dos repositories que se registre en este proceso de test.
  t.mock.module('../repositories/ramos.repository.js', {
    namedExports: {
      findPlanById: (...args) => contextoRepoState.ramos.findPlanById(...args),
      findRamoById: (...args) => contextoRepoState.ramos.findRamoById(...args),
      findFormasPagoDelPlan: (...args) => contextoRepoState.ramos.findFormasPagoDelPlan(...args),
      findCoberturasByPlanId: (...args) => contextoRepoState.ramos.findCoberturasByPlanId(...args),
    },
  })

  t.mock.module('../repositories/coberturas.repository.js', {
    namedExports: {
      findRubroPorNombre: (...args) => contextoRepoState.coberturas.findRubroPorNombre(...args),
      findCoberturasCatalogoByRamoId: (...args) =>
        contextoRepoState.coberturas.findCoberturasCatalogoByRamoId(...args),
      findTasasCoberturaRamo: (...args) =>
        contextoRepoState.coberturas.findTasasCoberturaRamo(...args),
      findTasasRiesgoObjeto: (...args) =>
        contextoRepoState.coberturas.findTasasRiesgoObjeto(...args),
    },
  })

  sincronizarContextoRepoState({
    ramos: {
      findPlanById: async () => plan,
      findRamoById: async () => ramo,
      findFormasPagoDelPlan: async () => FORMAS_PAGO_CONTADO,
      findCoberturasByPlanId: async () => [],
    },
    coberturas: {
      findRubroPorNombre: async () => null,
      findCoberturasCatalogoByRamoId: async () => [
        { codigo: 'incendio_edificio', nombre: 'Incendio de Edificio', franquicia_default: null },
      ],
      findTasasCoberturaRamo: async () => [],
      findTasasRiesgoObjeto: async () => tasasObjetoRiesgo,
    },
  })

  t.mock.module('../repositories/cotizaciones.repository.js', {
    namedExports: {
      crearCotizacionAtomica: async (payload) => {
        cotizacionesCreadas.push(payload)
        return 99
      },
      actualizarCotizacionAtomica: async (payload) => {
        cotizacionesActualizadas.push(payload)
        return payload.p_cotizacion_id
      },
      findCotizacionById: async (id) => ({ id, ...insertados }),
    },
  })

  t.mock.module('./tipo-cambio.service.js', {
    namedExports: {
      obtenerTipoCambioVigente: async () => tipoCambio,
      registrarTipoCambioManual: async () => {},
    },
  })

  return { cotizacionesCreadas, cotizacionesActualizadas }
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

test('crearCotizacion con moneda:USD persiste moneda + snapshot de tipo de cambio vía un único RPC atómico', async (t) => {
  invalidarCacheCatalogos()
  const { cotizacionesCreadas } = mockearRepositorios(t)
  const { crearCotizacion } =
    await import('./cotizacion-persistence.service.js?case=crear-usd-snapshot')

  await crearCotizacion(bodyBase({ moneda: 'USD' }), USUARIO)

  assert.equal(
    cotizacionesCreadas.length,
    1,
    'crearCotizacionAtomica debe llamarse exactamente una vez (un solo RPC, no inserts secuenciales)'
  )
  const payload = cotizacionesCreadas[0]
  assert.equal(payload.p_cotizacion.moneda, 'USD')
  assert.equal(payload.p_cotizacion.tipo_cambio_snapshot, 7300.75)
  assert.equal(payload.p_cotizacion.tipo_cambio_fuente, 'dolarpy:set')
  assert.equal(payload.p_cotizacion.tipo_cambio_fecha, '2026-07-27T00:00:00Z')
})

test('crearCotizacion en la misma moneda del umbral no invoca tipo de cambio ni persiste snapshot', async (t) => {
  invalidarCacheCatalogos()
  const { cotizacionesCreadas } = mockearRepositorios(t)
  const { crearCotizacion } =
    await import('./cotizacion-persistence.service.js?case=crear-misma-moneda')

  await crearCotizacion(bodyBase({ moneda: 'PYG' }), USUARIO)

  assert.equal(cotizacionesCreadas.length, 1)
  const payload = cotizacionesCreadas[0]
  assert.equal(payload.p_cotizacion.moneda, 'PYG')
  assert.equal(payload.p_cotizacion.tipo_cambio_snapshot, undefined)
  assert.equal(payload.p_cotizacion.tipo_cambio_fuente, undefined)
  assert.equal(payload.p_cotizacion.tipo_cambio_fecha, undefined)
})

// Nota: este test ejercita `calcularPreview` (no `crearCotizacion`/`actualizarCotizacion`), pero
// se relocó acá junto con el resto de moneda+snapshot/RPC error passthrough por instrucción
// explícita de tasks.md 4.1 / design.md (PR4 test-reorg) — comparte los mismos fixtures
// (`PLAN_OBJETO_RIESGO`/`RAMO_INCENDIO`/`TASAS_OBJETO_RIESGO_VIVIENDA_FAMILIAR`) que las demás
// pruebas de este archivo. `calcularPreview` sigue viviendo en el barrel (`cotizacion.service.js`)
// — no en `cotizacion-persistence.service.js` — así que el import apunta al barrel, no al módulo
// nuevo; solo `calcularPreview no persiste nada` quedó en `cotizacion.service.test.js`.
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

// Cambio SDD `cotizacion-transaccional` (PR2, Phase 2 RED) — reemplaza el test anterior
// ("crearCotizacion borra la cabecera recién creada y re-lanza el error original..."), que
// asumía la compensación manual `deleteCotizacion` de la implementación pre-RPC. Con
// `crear_cotizacion_atomica` corriendo en una única transacción de Postgres (migración 052,
// ya mergeada a `main` en PR1), un fallo a mitad de camino nunca deja una cabecera huérfana
// para compensar — la transacción entera se revierte del lado de la base. El servicio, del
// lado de JS, solo debe re-lanzar el error tal cual, sin ningún intento de compensación ni
// reintento.
test('crearCotizacion re-lanza el error original del RPC atómico, sin ninguna compensación manual', async (t) => {
  invalidarCacheCatalogos()

  const errorOriginal = new Error('duplicate key value violates unique constraint')
  let llamadasRpc = 0

  t.mock.module('../repositories/ramos.repository.js', {
    namedExports: {
      findPlanById: async () => PLAN_OBJETO_RIESGO,
      findRamoById: async () => RAMO_INCENDIO,
      findFormasPagoDelPlan: async () => FORMAS_PAGO_CONTADO,
      findCoberturasByPlanId: async () => [],
    },
  })

  t.mock.module('../repositories/coberturas.repository.js', {
    namedExports: {
      findRubroPorNombre: async () => null,
      findCoberturasCatalogoByRamoId: async () => [
        { codigo: 'incendio_edificio', nombre: 'Incendio de Edificio', franquicia_default: null },
      ],
      findTasasCoberturaRamo: async () => [],
      findTasasRiesgoObjeto: async () => TASAS_OBJETO_RIESGO_VIVIENDA_FAMILIAR,
    },
  })

  // Ver nota grande al inicio del archivo.
  sincronizarContextoRepoState({
    ramos: {
      findPlanById: async () => PLAN_OBJETO_RIESGO,
      findRamoById: async () => RAMO_INCENDIO,
      findFormasPagoDelPlan: async () => FORMAS_PAGO_CONTADO,
      findCoberturasByPlanId: async () => [],
    },
    coberturas: {
      findRubroPorNombre: async () => null,
      findCoberturasCatalogoByRamoId: async () => [
        { codigo: 'incendio_edificio', nombre: 'Incendio de Edificio', franquicia_default: null },
      ],
      findTasasCoberturaRamo: async () => [],
      findTasasRiesgoObjeto: async () => TASAS_OBJETO_RIESGO_VIVIENDA_FAMILIAR,
    },
  })

  t.mock.module('./tipo-cambio.service.js', {
    namedExports: {
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

  // Único export relevante: `crearCotizacionAtomica` rechaza directamente con el error de
  // Postgres (ej. un FK/constraint violado a mitad de la función plpgsql) — no hay
  // `deleteCotizacion`/`insertCotizacion`/`nextNumeroCorrelativo` en este mock: si el servicio
  // todavía los invoca, la llamada revienta contra `undefined`, no contra `errorOriginal`.
  t.mock.module('../repositories/cotizaciones.repository.js', {
    namedExports: {
      crearCotizacionAtomica: async () => {
        llamadasRpc += 1
        throw errorOriginal
      },
      findCotizacionById: async (id) => ({ id }),
    },
  })

  const { crearCotizacion } =
    await import('./cotizacion-persistence.service.js?case=crear-rollback-error')

  await assert.rejects(
    () => crearCotizacion(bodyBase({ moneda: 'PYG' }), USUARIO),
    (err) => {
      assert.equal(err, errorOriginal, 'debe re-lanzar el error original sin envolverlo')
      return true
    }
  )

  assert.equal(llamadasRpc, 1, 'un único intento de RPC — sin reintento y sin compensación')
})

test('actualizarCotizacion con nueva moneda:USD persiste moneda + snapshot vía un único RPC atómico', async (t) => {
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
    namedExports: {
      findPlanById: async () => PLAN_OBJETO_RIESGO,
      findRamoById: async () => RAMO_INCENDIO,
      findFormasPagoDelPlan: async () => FORMAS_PAGO_CONTADO,
      findCoberturasByPlanId: async () => [],
    },
  })

  t.mock.module('../repositories/coberturas.repository.js', {
    namedExports: {
      findRubroPorNombre: async () => null,
      findCoberturasCatalogoByRamoId: async () => [
        { codigo: 'incendio_edificio', nombre: 'Incendio de Edificio', franquicia_default: null },
      ],
      findTasasCoberturaRamo: async () => [],
      findTasasRiesgoObjeto: async () => TASAS_OBJETO_RIESGO_VIVIENDA_FAMILIAR,
    },
  })

  // Ver nota grande al inicio del archivo.
  sincronizarContextoRepoState({
    ramos: {
      findPlanById: async () => PLAN_OBJETO_RIESGO,
      findRamoById: async () => RAMO_INCENDIO,
      findFormasPagoDelPlan: async () => FORMAS_PAGO_CONTADO,
      findCoberturasByPlanId: async () => [],
    },
    coberturas: {
      findRubroPorNombre: async () => null,
      findCoberturasCatalogoByRamoId: async () => [
        { codigo: 'incendio_edificio', nombre: 'Incendio de Edificio', franquicia_default: null },
      ],
      findTasasCoberturaRamo: async () => [],
      findTasasRiesgoObjeto: async () => TASAS_OBJETO_RIESGO_VIVIENDA_FAMILIAR,
    },
  })

  t.mock.module('./tipo-cambio.service.js', {
    namedExports: {
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

  // Sin `insertCotizacion`/`nextNumeroCorrelativo`/`insertVariante`/`insertCoberturas`/etc: ya no
  // existen como exports del repository (ver design.md — la actualización deja de ser un
  // insertar-nuevo-antes-de-borrar-viejo hecho desde JS, todo vive dentro de
  // `actualizar_cotizacion_atomica`).
  const cotizacionesActualizadas = []
  t.mock.module('../repositories/cotizaciones.repository.js', {
    namedExports: {
      findCotizacionById: async () => cotizacionExistente,
      actualizarCotizacionAtomica: async (payload) => {
        cotizacionesActualizadas.push(payload)
        return payload.p_cotizacion_id
      },
    },
  })
  const { actualizarCotizacion } =
    await import('./cotizacion-persistence.service.js?case=actualizar-usd-snapshot')

  await actualizarCotizacion(5, bodyBase({ moneda: 'USD' }), USUARIO)

  assert.equal(
    cotizacionesActualizadas.length,
    1,
    'actualizarCotizacionAtomica debe llamarse exactamente una vez'
  )
  const payload = cotizacionesActualizadas[0]
  assert.equal(payload.p_cotizacion_id, 5)
  assert.equal(payload.p_cotizacion.moneda, 'USD')
  assert.equal(payload.p_cotizacion.tipo_cambio_snapshot, 7300.75)
})
