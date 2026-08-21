import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { invalidarCacheCatalogos } from './cache.js'

// Estado compartido consumido por los mocks de `ramos.repository.js`/`coberturas.repository.js`
// registrados más abajo (ver `mockearRepositorios`, el primer helper del archivo en ejecutarse
// desde que `resolverDescuentos`/`resolverTasaRpf` se relocaron a
// `cotizacion-pricing.service.test.js` en PR 3a). Desde el split `cotizacion-service-split`
// (PR2), `validarYResolverContexto` y `resolverContextoRepositorios` viven en
// `cotizacion-context.service.js`, un módulo con specifier ESTABLE (sin query string) que
// `cotizacion.service.js?case=X` importa de forma estática. Node solo evalúa ese módulo UNA vez
// por proceso de test (la primera vez que se importa, en este archivo eso ocurre durante el
// primer test del archivo, dentro de `mockearRepositorios`) — su propio
// `import * as ramosRepository from '../repositories/ramos.repository.js'` queda atado PARA
// SIEMPRE al mock que esté activo en ESE momento, sin importar qué `t.mock.module` registre un
// test posterior (mismo hallazgo que el de `tipo-cambio.service.js` en PR1). Por eso el PRIMER
// `t.mock.module` de este archivo para esos dos repositories no puede devolver funciones "fijas":
// expone funciones puente que leen `contextoRepoState` en el momento de la LLAMADA (no de la
// importación), y `sincronizarContextoRepoState` actualiza este objeto antes de cada test que
// necesita `validarYResolverContexto`/`resolverContextoRepositorios` — los `t.mock.module` de más
// abajo siguen siendo necesarios además, para el uso DIRECTO que sigue haciendo el barrel
// (`cotizacion.service.js`) de estos mismos repositories (findFormasPagoDelPlan/findCurvaRpf/
// findCoberturasByPlanId/etc.), que sí se re-mockea fresco en cada test porque ese import se
// reevalúa vía el query string `?case=X`.
const contextoRepoState = {
  ramos: {},
  coberturas: {},
}

function sincronizarContextoRepoState({ ramos = {}, coberturas = {} } = {}) {
  contextoRepoState.ramos = ramos
  contextoRepoState.coberturas = coberturas
}

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

  t.mock.module('../repositories/ramos.repository.js', {
    namedExports: {
      findPlanById: async () => plan,
      findRamoById: async () => ramo,
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
      findTasasRiesgoObjeto: async () => tasasObjetoRiesgo,
    },
  })

  // Ver nota grande al inicio del archivo: `validarYResolverContexto`/`resolverContextoRepositorios`
  // (cotizacion-context.service.js) leen este objeto en vez del `t.mock.module` de arriba.
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

// Test de seguridad (spec.md — "User without permission cannot override via API"): el bloqueo
// es de BACKEND, no solo de UI. Un POST directo con otro % de descuento debe seguir cotizando
// al 10% del plan — pasa por el calculador REAL de MRC (no mockeado), solo se mockean los
// repositories, igual que el resto de este archivo.
describe('construirVariantes (vía calcularPreview) — enforcement del descuento fijo del plan', () => {
  const PLAN_MRC_DESCUENTO_FIJO = {
    id: 20,
    ramo_id: 2,
    nombre: 'MULTIRRISGO COMERCIO - CONTADO 10 (PLACEHOLDER - CONFIRMAR NOMBRE CON KEVIN)',
    prima_tecnica_minima: 100,
    responsabilidad_maxima_cotizable: 999_999_999_999,
    cotizacion_combinada: false,
    descuento_default: 10,
    descuento_maximo: 10,
    recargo_maximo: 20,
    cuotas_default: 0,
  }
  const RAMO_MRC = { id: 2, nombre: 'mrc', calculador: 'mrc', activo: true }
  const FORMAS_PAGO_CONTADO_MRC = [
    {
      forma_pago_id: 1,
      tasa_rpf: 0,
      formas_pago: { codigo: 'contado', nombre_display: 'Contado' },
    },
  ]
  const CATALOGO_MRC = [
    { codigo: 'incendio_edificio', nombre: 'Incendio Edificio', categoria: 'Coberturas' },
    { codigo: 'incendio_contenido', nombre: 'Incendio Contenido', categoria: 'Coberturas' },
    { codigo: 'responsabilidad_civil', nombre: 'Responsabilidad Civil', categoria: 'Coberturas' },
  ]
  const TASAS_MRC = [
    { coberturas_catalogo: { codigo: 'responsabilidad_civil' }, tasa_valor: 2, unidad: 'permil' },
  ]
  const PLAN_COBERTURAS_MRC = [
    { franquicia: null, coberturas_catalogo: { codigo: 'incendio_edificio' } },
    { franquicia: null, coberturas_catalogo: { codigo: 'incendio_contenido' } },
    { franquicia: 800_000, coberturas_catalogo: { codigo: 'responsabilidad_civil' } },
  ]

  function mockearRepositoriosMrc(t) {
    // Ver nota grande al inicio del archivo: este es hoy el PRIMER `t.mock.module` de estos dos
    // repositories en ejecutarse en todo el archivo (primer test del archivo), así que es el que
    // queda atado para siempre al import estático de `cotizacion-context.service.js` — no puede
    // ser fijo, tiene que reenviar a `contextoRepoState` en el momento de la llamada.
    t.mock.module('../repositories/ramos.repository.js', {
      namedExports: {
        findPlanById: (...args) => contextoRepoState.ramos.findPlanById(...args),
        findRamoById: (...args) => contextoRepoState.ramos.findRamoById(...args),
        findFormasPagoDelPlan: (...args) => contextoRepoState.ramos.findFormasPagoDelPlan(...args),
        findCoberturasByPlanId: (...args) =>
          contextoRepoState.ramos.findCoberturasByPlanId(...args),
        findTasaCapital: (...args) => contextoRepoState.ramos.findTasaCapital(...args),
        findCurvaRpf: (...args) => contextoRepoState.ramos.findCurvaRpf(...args),
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
        findTarifasGenericoByPlanId: (...args) =>
          contextoRepoState.coberturas.findTarifasGenericoByPlanId(...args),
      },
    })
    // Ver nota grande al inicio del archivo.
    sincronizarContextoRepoState({
      ramos: {
        findPlanById: async () => PLAN_MRC_DESCUENTO_FIJO,
        findRamoById: async () => RAMO_MRC,
        findFormasPagoDelPlan: async () => FORMAS_PAGO_CONTADO_MRC,
        findCoberturasByPlanId: async () => PLAN_COBERTURAS_MRC,
      },
      coberturas: {
        findRubroPorNombre: async () => ({
          nombre: 'Bazar',
          tasa_edificio: 2,
          tasa_contenido: 1.5,
        }),
        findCoberturasCatalogoByRamoId: async () => CATALOGO_MRC,
        findTasasCoberturaRamo: async () => TASAS_MRC,
        findTasasRiesgoObjeto: async () => null,
      },
    })
    // cotizacion.service.js importa también cotizaciones.repository.js y tipo-cambio.service.js
    // (este último con una cadena propia hasta config/supabase.js) — sin mockearlos acá el import
    // dinámico de más abajo revienta en CI (sin .env), aunque calcularPreview nunca los invoque
    // en el camino de preview que testean estos casos.
    t.mock.module('../repositories/cotizaciones.repository.js', { namedExports: {} })
    // `umbral-inspeccion.service.js` (specifier ESTABLE, igual que `cotizacion-context.service.js`)
    // importa `tipo-cambio.service.js` de forma estática — este es hoy el PRIMER
    // `t.mock.module('./tipo-cambio.service.js', ...)` del archivo en ejecutarse, así que queda
    // atado para siempre a lo que devuelva acá (mismo hallazgo que PR1). No puede ser
    // `{ namedExports: {} }`: usa el mismo fixture canónico (venta/fuente/fecha) que el resto del
    // archivo, para que los tests posteriores que sí necesitan conversión de moneda (vía
    // resolverUmbralInspeccion) reciban un valor real y consistente.
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
  }

  function bodyMrc(descuentoPorcentaje) {
    return {
      plan_id: PLAN_MRC_DESCUENTO_FIJO.id,
      riesgo_datos: {
        cedula: '1234567',
        direccion: 'Calle Falsa 123',
        ciudad: 'Asunción',
        rubro_actividad: 'Bazar',
        capital_edificio: 10_000_000,
        capital_contenido: 5_000_000,
        coberturas_adicionales: [{ codigo: 'responsabilidad_civil', suma_asegurada: 1_000_000 }],
      },
      capital_asegurado: 0,
      cliente_nombre: 'Cliente Test',
      descuentos: [{ descripcion: 'Descuento agente', porcentaje: descuentoPorcentaje }],
    }
  }

  // primaBase = 10.000.000×2/1000 + 5.000.000×1.5/1000 + 1.000.000×2/1000 = 20.000+7.500+2.000 = 29.500

  test('usuario SIN permiso: manda 5% en el body, el backend igual aplica el 10% del plan', async (t) => {
    invalidarCacheCatalogos()
    mockearRepositoriosMrc(t)
    const { calcularPreview } = await import('./cotizacion.service.js?case=security-sin-permiso')

    const usuarioSinPermiso = { id: 1, rol: 'agente', puede_editar_descuento_plan: false }
    const resultado = await calcularPreview(bodyMrc(5), usuarioSinPermiso)

    assert.equal(resultado.detalle.total_descuentos, 2_950, '10% de 29.500, no 5%')
    assert.equal(resultado.prima, 29_500 - 2_950)
  })

  test('usuario CON permiso: su 5% enviado por body SÍ se respeta', async (t) => {
    invalidarCacheCatalogos()
    mockearRepositoriosMrc(t)
    const { calcularPreview } = await import('./cotizacion.service.js?case=security-con-permiso')

    const usuarioConPermiso = { id: 2, rol: 'admin', puede_editar_descuento_plan: true }
    const resultado = await calcularPreview(bodyMrc(5), usuarioConPermiso)

    assert.equal(resultado.detalle.total_descuentos, 1_475, '5% de 29.500, respetado')
  })
})

// Regresión (design.md Decisión 3): `008_seed_planes_auto.sql` ya carga `descuento_default` en
// los planes Auto PREMIUM/SUPERIOR/FUERTE (`cotizacion_combinada = TRUE`), donde
// `resolverTiposFranquicia` lo consume para la variante con franquicia. Sin la guarda
// `!plan.cotizacion_combinada` en `resolverDescuentos`, reutilizar la columna forzaría un
// descuento SOBRE la prima de Auto además del que ya aplica `resolverTiposFranquicia` — doble
// descuento. Este test prueba, de punta a punta (vía calcularPreview, sin mockear
// resolverTiposFranquicia), que un plan combinado sigue devolviendo exactamente 1 descuento del
// 20% (el de franquicia), no 2.
describe('construirVariantes (vía calcularPreview) — Auto cotizacion_combinada sin doble descuento', () => {
  const PLAN_AUTO_PREMIUM = {
    id: 30,
    ramo_id: 3,
    nombre: 'PLAN TAJY PREMIUM',
    prima_tecnica_minima: 100,
    cotizacion_combinada: true,
    descuento_default: 20,
    franquicia_porcentaje: 12,
    cuotas_default: 11,
  }
  const RAMO_AUTO = { id: 3, nombre: 'auto', calculador: 'auto', activo: true }
  const FORMAS_PAGO_AUTO = [
    {
      forma_pago_id: 1,
      tasa_rpf: 0,
      formas_pago: { codigo: 'contado', nombre_display: 'Contado' },
    },
  ]

  test('primaAjustada de la variante con_franquicia refleja UN solo 20%, no un 40% doble-aplicado', async (t) => {
    invalidarCacheCatalogos()
    t.mock.module('../repositories/ramos.repository.js', {
      namedExports: {
        findPlanById: async () => PLAN_AUTO_PREMIUM,
        findRamoById: async () => RAMO_AUTO,
        findFormasPagoDelPlan: async () => FORMAS_PAGO_AUTO,
        findCoberturasByPlanId: async () => [],
        findTasaCapital: async () => ({ tasa_porcentaje: 5 }),
      },
    })
    t.mock.module('../repositories/coberturas.repository.js', { namedExports: {} })
    // Ver nota grande al inicio del archivo. `auto` no llama a ningún método de
    // coberturas.repository.js dentro de resolverContextoRepositorios, así que ese lado queda {}.
    sincronizarContextoRepoState({
      ramos: {
        findPlanById: async () => PLAN_AUTO_PREMIUM,
        findRamoById: async () => RAMO_AUTO,
        findFormasPagoDelPlan: async () => FORMAS_PAGO_AUTO,
        findCoberturasByPlanId: async () => [],
        findTasaCapital: async () => ({ tasa_porcentaje: 5 }),
      },
    })
    t.mock.module('../repositories/cotizaciones.repository.js', { namedExports: {} })
    t.mock.module('./tipo-cambio.service.js', { namedExports: {} })
    const { calcularPreview } =
      await import('./cotizacion.service.js?case=regresion-auto-combinado')

    const resultado = await calcularPreview(
      {
        plan_id: PLAN_AUTO_PREMIUM.id,
        capital_asegurado: 10_000_000,
        riesgo_datos: {
          marca: 'Toyota',
          modelo: 'Corolla',
          anio_fabricacion: 2020,
          destino: 'PARTICULAR',
          via_importacion: 'REPRESENTANTE',
        },
        cliente_nombre: 'Cliente Test',
      },
      { id: 1, rol: 'agente', puede_editar_descuento_plan: false }
    )

    // primaBase = 10.000.000 × 5% = 500.000 (sin descuento — resolverDescuentos no fuerza acá).
    assert.equal(resultado.prima, 500_000)
    assert.equal(resultado.variantes.length, 2)

    const sinFranquicia = resultado.variantes.find((v) => v.tipo_franquicia === 'sin_franquicia')
    const conFranquicia = resultado.variantes.find((v) => v.tipo_franquicia === 'con_franquicia')

    assert.equal(sinFranquicia.prima, 500_000, 'sin franquicia: prima intacta, sin descuento')
    // 500.000 × (1 − 20%) = 400.000 — UN solo 20%, no 500.000 × (1-20%) × (1-20%) = 320.000
    assert.equal(conFranquicia.prima, 400_000)
    assert.notEqual(conFranquicia.prima, 320_000, 'no debe aplicarse el 20% dos veces')
  })
})

// Regresión obligatoria de `rpf-variable-mrc` (design.md — Testing Strategy, "Auto/Auto-Flota
// zero diff"): Auto NO tiene `usa_rpf_por_cuotas`, así que resolverTasaRpf debe devolver el
// escalar legacy `plan_formas_pago.tasa_rpf` intacto — el Premio de una forma de pago financiada
// (no contado) debe dar exactamente igual que antes de este cambio. Valores fijados a mano:
// prima=500.000 (10.000.000×5%), rpf=ceil(500.000×3.5%/1000)×1000=18.000,
// iva=500.000×10%+18.000×10%=51.800, premio=floor((500.000+18.000+51.800)/1000)×1000=569.000,
// cuota=floor(569.000/12/1000)×1000=47.000, inicial=floor((569.000−11×47.000)/1000)×1000=52.000.
describe('construirVariantes (vía calcularPreview) — Auto con forma de pago financiada: regresión de RPF (rpf-variable-mrc)', () => {
  const PLAN_AUTO_BASICO = {
    id: 31,
    ramo_id: 3,
    nombre: 'PLAN TAJY BASICO',
    prima_tecnica_minima: 100,
    cotizacion_combinada: false,
    cuotas_default: 11,
  }
  const RAMO_AUTO_NO_FLAGGED = {
    id: 3,
    nombre: 'auto',
    calculador: 'auto',
    activo: true,
    usa_rpf_por_cuotas: false,
  }
  const FORMA_PAGO_COBRADOR = [
    {
      forma_pago_id: 2,
      tasa_rpf: 3.5,
      formas_pago: { codigo: 'cobrador', nombre_display: 'Cobrador' },
    },
  ]

  test('Premio/RPF/IVA/Inicial/Cuota byte-idénticos al valor fijado a mano (cero diff)', async (t) => {
    invalidarCacheCatalogos()
    t.mock.module('../repositories/ramos.repository.js', {
      namedExports: {
        findPlanById: async () => PLAN_AUTO_BASICO,
        findRamoById: async () => RAMO_AUTO_NO_FLAGGED,
        findFormasPagoDelPlan: async () => FORMA_PAGO_COBRADOR,
        findCoberturasByPlanId: async () => [],
        findTasaCapital: async () => ({ tasa_porcentaje: 5 }),
        // Auto no tiene el flag activo — si construirVariantes invocara findCurvaRpf igual,
        // este mock revienta el test en vez de dejar pasar en falso un wiring incorrecto.
        findCurvaRpf: async () => {
          throw new Error('findCurvaRpf no debe invocarse: Auto no tiene usa_rpf_por_cuotas')
        },
      },
    })
    t.mock.module('../repositories/coberturas.repository.js', { namedExports: {} })
    // Ver nota grande al inicio del archivo. `auto` no llama a ningún método de
    // coberturas.repository.js dentro de resolverContextoRepositorios, así que ese lado queda {}.
    sincronizarContextoRepoState({
      ramos: {
        findPlanById: async () => PLAN_AUTO_BASICO,
        findRamoById: async () => RAMO_AUTO_NO_FLAGGED,
        findFormasPagoDelPlan: async () => FORMA_PAGO_COBRADOR,
        findCoberturasByPlanId: async () => [],
        findTasaCapital: async () => ({ tasa_porcentaje: 5 }),
      },
    })
    t.mock.module('../repositories/cotizaciones.repository.js', { namedExports: {} })
    t.mock.module('./tipo-cambio.service.js', { namedExports: {} })
    const { calcularPreview } =
      await import('./cotizacion.service.js?case=regresion-auto-rpf-financiado')

    const resultado = await calcularPreview(
      {
        plan_id: PLAN_AUTO_BASICO.id,
        capital_asegurado: 10_000_000,
        riesgo_datos: {
          marca: 'Toyota',
          modelo: 'Corolla',
          anio_fabricacion: 2020,
          destino: 'PARTICULAR',
          via_importacion: 'REPRESENTANTE',
        },
        cliente_nombre: 'Cliente Test',
      },
      { id: 1, rol: 'agente' }
    )

    const [variante] = resultado.variantes
    const [cobrador] = variante.formasPago

    assert.equal(cobrador.rpf_porcentaje, 3.5, 'escalar legacy intacto, no la curva')
    assert.equal(cobrador.rpf, 18_000)
    assert.equal(cobrador.iva, 51_800)
    assert.equal(cobrador.premio, 569_000)
    assert.equal(cobrador.inicial, 52_000)
    assert.equal(cobrador.cuota, 47_000)
  })
})

test('calcularPreview no persiste nada (nunca invoca crearCotizacionAtomica)', async (t) => {
  invalidarCacheCatalogos()
  const { cotizacionesCreadas } = mockearRepositorios(t)
  const { calcularPreview } = await import('./cotizacion.service.js?case=preview-no-persiste')

  const resultado = await calcularPreview(bodyBase({ moneda: 'USD' }), USUARIO)

  assert.ok(resultado.prima > 0)
  assert.equal(
    cotizacionesCreadas.length,
    0,
    'el preview nunca debe llegar a crearCotizacionAtomica'
  )
})

// Nota (PR4 de `cotizacion-service-split`): los tests de `crearCotizacion`/`actualizarCotizacion`
// (moneda+snapshot, RPC error passthrough) y el de "tasa por objeto de riesgo con override" se
// relocaron a `cotizacion-persistence.service.test.js` — ver tasks.md Fase 4 / design.md PR4
// test-reorg. Este archivo conserva solo `calcularPreview no persiste nada` (arriba), que
// verifica el camino de preview, no de persistencia.
