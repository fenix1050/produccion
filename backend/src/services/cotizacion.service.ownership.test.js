import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { httpError } from '../utils/http-error.js'

import { invalidarCacheCatalogos } from './cache.js'

// Cobertura de aislamiento horizontal (IDOR) — issue #188. `verificarPropiedad()` (helper privado
// de cotizacion.service.js) ya existe y funciona: estos tests solo la ejercitan a través de las 4
// funciones exportadas que la usan (directa o indirectamente), para que una futura regresión de
// esa función (o de listarCotizaciones, que filtra distinto — ver abajo) rompa un test acá antes
// de llegar a producción. NO se cambia código de producción en este archivo.
//
// Mismo patrón que el resto de cotizacion.service.test.js: import dinámico + `t.mock.module` de
// los 4 módulos que cotizacion.service.js importa a nivel de módulo (ramos.repository,
// coberturas.repository, cotizaciones.repository, tipo-cambio.service) — sin mockearlos, el
// import dinámico revienta en CI (sin .env) al cargar la cadena real hasta config/supabase.js.
// `pdf.service.js` solo se mockea en los tests de `generarPdfOferta` (los únicos que lo invocan).

const AGENTE_A = { id: 1, rol: 'agente' }
const AGENTE_B = { id: 2, rol: 'agente' }
const ADMIN = { id: 99, rol: 'admin' }

// Cotización "de otro" — pertenece a AGENTE_B (agente_id: 2).
const COTIZACION_DE_B = { id: 7, agente_id: AGENTE_B.id, ramo_id: 1, plan_id: 10 }
const COTIZACION_DE_A = { id: 7, agente_id: AGENTE_A.id, ramo_id: 1, plan_id: 10 }

const ERROR_404 = httpError(404, 'Cotización no encontrada', 'Cotización no encontrada')

// Ver nota equivalente en cotizacion.service.test.js: `node --test` corre cada archivo de test en
// su propio proceso, así que este archivo tiene su PROPIO punto de congelamiento independiente
// para el import estático de `cotizacion-context.service.js` (desde el split
// `cotizacion-service-split`, PR2) — el primer `t.mock.module` de ramos/coberturas de ESTE
// archivo (acá abajo, en `mockModulosBase`) es el que queda atado para siempre, sin importar qué
// mockeen `mockModulosActualizar`/`mockModulosPdf` después. Por eso ese primer mock reenvía a
// `contextoRepoState` en vez de devolver exports fijos.
//
// PR4 de `cotizacion-service-split`: el mismo hallazgo aplica ahora también a
// `cotizaciones.repository.js`, porque `crearCotizacion`/`actualizarCotizacion` viven en
// `cotizacion-persistence.service.js` — un módulo con specifier ESTABLE que el barrel re-exporta
// de forma incondicional (`export { crearCotizacion, actualizarCotizacion } from
// './cotizacion-persistence.service.js'`), así que se evalúa (y su propio `import * as
// cotizacionesRepository` se congela) en el PRIMER import del barrel de este archivo — que hoy es
// el primer test de `obtenerCotizacion` (vía `mockModulosBase`), no el de `actualizarCotizacion`.
// Sin bridging acá, `actualizarCotizacion` quedaría atado para siempre al mock de
// `obtenerCotizacion` (sin `actualizarCotizacionAtomica`), rompiendo con
// "TypeError: actualizarCotizacionAtomica is not a function".
const contextoRepoState = { ramos: {}, coberturas: {}, cotizaciones: {} }

function sincronizarContextoRepoState({ ramos = {}, coberturas = {} } = {}) {
  contextoRepoState.ramos = ramos
  contextoRepoState.coberturas = coberturas
}

function mockModulosBase(t, { findCotizacionById, findCotizaciones, actualizarCotizacionAtomica }) {
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
  t.mock.module('./tipo-cambio.service.js', { namedExports: {} })
  // Ver nota grande al inicio del archivo (PR4): bridging para que
  // `cotizacion-persistence.service.js` (congelado en este primer import del barrel) siga viendo
  // los mocks que registre `mockModulosActualizar` más abajo.
  t.mock.module('../repositories/cotizaciones.repository.js', {
    namedExports: {
      findCotizacionById: (...args) => contextoRepoState.cotizaciones.findCotizacionById(...args),
      findCotizaciones: (...args) => contextoRepoState.cotizaciones.findCotizaciones(...args),
      actualizarCotizacionAtomica: (...args) =>
        contextoRepoState.cotizaciones.actualizarCotizacionAtomica(...args),
    },
  })
  contextoRepoState.cotizaciones = {
    findCotizacionById,
    findCotizaciones:
      findCotizaciones ??
      (async () => {
        throw new Error('findCotizaciones no debería invocarse')
      }),
    actualizarCotizacionAtomica:
      actualizarCotizacionAtomica ??
      (async () => {
        throw new Error('actualizarCotizacionAtomica no debería invocarse')
      }),
  }
}

describe('obtenerCotizacion — aislamiento horizontal', () => {
  test('dueño (A sobre su propia cotización): succeeds, comportamiento actual', async (t) => {
    mockModulosBase(t, { findCotizacionById: async () => COTIZACION_DE_A })
    const { obtenerCotizacion } = await import('./cotizacion.service.js?case=obtener-owner')

    const resultado = await obtenerCotizacion(7, AGENTE_A)

    assert.deepEqual(resultado, COTIZACION_DE_A)
  })

  test('no-dueño (A sobre cotización de B): 403', async (t) => {
    mockModulosBase(t, { findCotizacionById: async () => COTIZACION_DE_B })
    const { obtenerCotizacion } = await import('./cotizacion.service.js?case=obtener-non-owner')

    // Lectura pura: sin efecto secundario que assertar además del 403 (N/A).
    await assert.rejects(
      () => obtenerCotizacion(7, AGENTE_A),
      (err) => {
        assert.equal(err.status, 403)
        return true
      }
    )
  })

  test('admin sobre cotización de B: bypasea el check, succeeds', async (t) => {
    mockModulosBase(t, { findCotizacionById: async () => COTIZACION_DE_B })
    const { obtenerCotizacion } = await import('./cotizacion.service.js?case=obtener-admin')

    const resultado = await obtenerCotizacion(7, ADMIN)

    assert.deepEqual(resultado, COTIZACION_DE_B)
  })

  test('cotización inexistente: 404, mismo comportamiento actual', async (t) => {
    mockModulosBase(t, {
      findCotizacionById: async () => {
        throw ERROR_404
      },
    })
    const { obtenerCotizacion } = await import('./cotizacion.service.js?case=obtener-404')

    await assert.rejects(
      () => obtenerCotizacion(999, AGENTE_A),
      (err) => {
        assert.equal(err.status, 404)
        return true
      }
    )
  })
})

describe('listarCotizaciones — filtro por agente (no usa verificarPropiedad)', () => {
  test('agente: agenteId pasado al repository es usuario.id', async (t) => {
    let agenteIdRecibido = 'sin-llamar'
    mockModulosBase(t, {
      findCotizacionById: async () => {
        throw new Error('no debería invocarse')
      },
      findCotizaciones: async ({ agenteId }) => {
        agenteIdRecibido = agenteId
        return { data: [], count: 0 }
      },
    })
    const { listarCotizaciones } = await import('./cotizacion.service.js?case=listar-agente')

    await listarCotizaciones({}, AGENTE_A)

    assert.equal(agenteIdRecibido, AGENTE_A.id)
  })

  test('admin: agenteId pasado al repository es undefined (sin filtro)', async (t) => {
    let agenteIdRecibido = 'sin-llamar'
    mockModulosBase(t, {
      findCotizacionById: async () => {
        throw new Error('no debería invocarse')
      },
      findCotizaciones: async ({ agenteId }) => {
        agenteIdRecibido = agenteId
        return { data: [], count: 0 }
      },
    })
    const { listarCotizaciones } = await import('./cotizacion.service.js?case=listar-admin')

    await listarCotizaciones({}, ADMIN)

    assert.equal(agenteIdRecibido, undefined)
  })
})

describe('generarPdfOferta — aislamiento horizontal', () => {
  const RAMO_INCENDIO = { id: 1, nombre: 'incendio', calculador: 'incendio', activo: true }
  const PLAN_DUMMY = { id: 10, nombre: 'PLAN DUMMY' }

  function mockModulosPdf(t, { findCotizacionById, renderOfertaPdf }) {
    t.mock.module('../repositories/coberturas.repository.js', { namedExports: {} })
    t.mock.module('./tipo-cambio.service.js', { namedExports: {} })
    t.mock.module('../repositories/ramos.repository.js', {
      namedExports: {
        findPlanById: async () => PLAN_DUMMY,
        findRamoById: async () => RAMO_INCENDIO,
        findCoberturasByPlanId: async () => [],
      },
    })
    t.mock.module('../repositories/cotizaciones.repository.js', {
      namedExports: { findCotizacionById },
    })
    t.mock.module('./pdf.service.js', { namedExports: { renderOfertaPdf } })
  }

  test('dueño (A sobre su propia cotización): succeeds, genera el PDF', async (t) => {
    let generado = false
    mockModulosPdf(t, {
      findCotizacionById: async () => COTIZACION_DE_A,
      renderOfertaPdf: async () => {
        generado = true
        return Buffer.from('pdf')
      },
    })
    const { generarPdfOferta } = await import('./cotizacion.service.js?case=pdf-owner')

    const resultado = await generarPdfOferta(7, AGENTE_A)

    assert.ok(generado, 'debe generar el PDF para el dueño')
    assert.ok(Buffer.isBuffer(resultado))
  })

  test('no-dueño (A sobre cotización de B): 403, NUNCA llega a generar el PDF', async (t) => {
    let generado = false
    mockModulosPdf(t, {
      findCotizacionById: async () => COTIZACION_DE_B,
      renderOfertaPdf: async () => {
        generado = true
        return Buffer.from('pdf')
      },
    })
    const { generarPdfOferta } = await import('./cotizacion.service.js?case=pdf-non-owner')

    await assert.rejects(
      () => generarPdfOferta(7, AGENTE_A),
      (err) => {
        assert.equal(err.status, 403)
        return true
      }
    )
    assert.equal(
      generado,
      false,
      'generarPdfOferta no tiene chequeo propio — depende 100% de verificarPropiedad'
    )
  })

  test('admin sobre cotización de B: bypasea el check, genera el PDF', async (t) => {
    let generado = false
    mockModulosPdf(t, {
      findCotizacionById: async () => COTIZACION_DE_B,
      renderOfertaPdf: async () => {
        generado = true
        return Buffer.from('pdf')
      },
    })
    const { generarPdfOferta } = await import('./cotizacion.service.js?case=pdf-admin')

    const resultado = await generarPdfOferta(7, ADMIN)

    assert.ok(generado)
    assert.ok(Buffer.isBuffer(resultado))
  })

  test('cotización inexistente: 404, no genera el PDF', async (t) => {
    let generado = false
    mockModulosPdf(t, {
      findCotizacionById: async () => {
        throw ERROR_404
      },
      renderOfertaPdf: async () => {
        generado = true
        return Buffer.from('pdf')
      },
    })
    const { generarPdfOferta } = await import('./cotizacion.service.js?case=pdf-404')

    await assert.rejects(
      () => generarPdfOferta(999, AGENTE_A),
      (err) => {
        assert.equal(err.status, 404)
        return true
      }
    )
    assert.equal(generado, false)
  })
})

describe('actualizarCotizacion — aislamiento horizontal', () => {
  // Cuerpo de riesgo mínimo válido para el schema de Incendio "objeto_riesgo" (mismo body/fixtures
  // que ya usa cotizacion.service.test.js para actualizarCotizacion — ver esa suite para el
  // detalle del schema completo).
  const RAMO_INCENDIO = { id: 1, nombre: 'incendio', calculador: 'incendio', activo: true }
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
    {
      forma_pago_id: 1,
      tasa_rpf: 0,
      formas_pago: { codigo: 'contado', nombre_display: 'Contado' },
    },
  ]

  function bodyActualizar() {
    return {
      plan_id: PLAN_OBJETO_RIESGO.id,
      riesgo_datos: { rubro_actividad: 'VIVIENDA FAMILIAR', capital_edificio: 1_000_000 },
      capital_asegurado: 0,
      cliente_nombre: 'Cliente Test',
      moneda: 'PYG',
    }
  }

  function existenteDe(agenteId) {
    return {
      id: 7,
      ramo_id: RAMO_INCENDIO.id,
      agente_id: agenteId,
      created_at: new Date().toISOString(),
      cotizacion_variantes: [],
      cotizacion_coberturas: [],
    }
  }

  function mockModulosActualizar(t, { findCotizacionById, actualizarCotizacionAtomica }) {
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
    // `cotizacion.service.js` (el barrel) importa `cotizaciones.repository.js` a nivel de módulo
    // (usado por obtenerCotizacion/listarCotizaciones/generarPdfOferta) — esa importación se
    // re-resuelve en CADA `import('./cotizacion.service.js?case=...')` fresco, a diferencia del
    // import de `cotizacion-persistence.service.js` (specifier estable, congelado desde el primer
    // test del archivo). Sin este mock, el CI (sin .env) revienta acá al cargar
    // `config/supabase.js` real — localmente pasaba de pura casualidad porque el `.env` real evita
    // el throw, aunque el módulo cargado igual fuera el real (sin usarse, ya que
    // `actualizarCotizacion` en sí sigue leyendo el binding correctamente mockeado de
    // `cotizacion-persistence.service.js`).
    t.mock.module('../repositories/cotizaciones.repository.js', {
      namedExports: {
        findCotizacionById: (...args) => contextoRepoState.cotizaciones.findCotizacionById(...args),
        actualizarCotizacionAtomica: (...args) =>
          contextoRepoState.cotizaciones.actualizarCotizacionAtomica(...args),
      },
    })
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
    // Ver nota grande al inicio del archivo (PR4): `cotizacion-persistence.service.js` ya está
    // congelado desde el primer test de `obtenerCotizacion` (bridging registrado en
    // `mockModulosBase`) — acá alcanza con actualizar el estado que ese bridging lee en cada
    // llamada, sin necesidad de un `t.mock.module` adicional para este specifier.
    contextoRepoState.cotizaciones = { findCotizacionById, actualizarCotizacionAtomica }
  }

  test('dueño (A sobre su propia cotización): succeeds, llama al RPC de actualización', async (t) => {
    invalidarCacheCatalogos()
    let llamadas = 0
    mockModulosActualizar(t, {
      findCotizacionById: async (id) =>
        llamadas === 0 ? existenteDe(AGENTE_A.id) : { id, agente_id: AGENTE_A.id },
      actualizarCotizacionAtomica: async (payload) => {
        llamadas += 1
        return payload.p_cotizacion_id
      },
    })
    const { actualizarCotizacion } = await import('./cotizacion.service.js?case=actualizar-owner')

    await actualizarCotizacion(7, bodyActualizar(), AGENTE_A)

    assert.equal(llamadas, 1, 'debe invocar el RPC de actualización para el dueño')
  })

  test('no-dueño (A sobre cotización de B): 403, el RPC de escritura NUNCA se llama', async (t) => {
    let llamadas = 0
    mockModulosActualizar(t, {
      findCotizacionById: async () => existenteDe(AGENTE_B.id),
      actualizarCotizacionAtomica: async (payload) => {
        llamadas += 1
        return payload.p_cotizacion_id
      },
    })
    const { actualizarCotizacion } =
      await import('./cotizacion.service.js?case=actualizar-non-owner')

    await assert.rejects(
      () => actualizarCotizacion(7, bodyActualizar(), AGENTE_A),
      (err) => {
        assert.equal(err.status, 403)
        return true
      }
    )
    assert.equal(llamadas, 0, 'actualizarCotizacionAtomica no debe llamarse tras un 403')
  })

  test('admin sobre cotización de B: bypasea el check, succeeds', async (t) => {
    invalidarCacheCatalogos()
    let llamadas = 0
    mockModulosActualizar(t, {
      findCotizacionById: async (id) =>
        llamadas === 0 ? existenteDe(AGENTE_B.id) : { id, agente_id: AGENTE_B.id },
      actualizarCotizacionAtomica: async (payload) => {
        llamadas += 1
        return payload.p_cotizacion_id
      },
    })
    const { actualizarCotizacion } = await import('./cotizacion.service.js?case=actualizar-admin')

    await actualizarCotizacion(7, bodyActualizar(), ADMIN)

    assert.equal(llamadas, 1, 'admin debe poder actualizar la cotización de otro agente')
  })

  test('cotización inexistente: 404, el RPC de escritura NUNCA se llama', async (t) => {
    let llamadas = 0
    mockModulosActualizar(t, {
      findCotizacionById: async () => {
        throw ERROR_404
      },
      actualizarCotizacionAtomica: async (payload) => {
        llamadas += 1
        return payload.p_cotizacion_id
      },
    })
    const { actualizarCotizacion } = await import('./cotizacion.service.js?case=actualizar-404')

    await assert.rejects(
      () => actualizarCotizacion(999, bodyActualizar(), AGENTE_A),
      (err) => {
        assert.equal(err.status, 404)
        return true
      }
    )
    assert.equal(llamadas, 0)
  })
})
