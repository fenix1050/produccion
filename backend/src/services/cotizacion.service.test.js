import assert from 'node:assert/strict'
import { test, describe } from 'node:test'

import { invalidarCacheCatalogos } from './cache.js'

// resolverDescuentos: helper puro (cambio SDD `mrc-plan-descuento-fijo`) que decide, ANTES de
// invocar al calculador, si el descuento efectivo es el que mandó el body o el forzado por
// `plan.descuento_default` — ver design.md Decisión 1. `forzadoPorPlan` es lo que después
// neutraliza el tope del usuario en el calculador (Decisión 2), así que se testea acá como
// parte del contrato del helper, no solo el array de `descuentos`.
//
// Import dinámico + repos mockeados en cada test (mismo patrón que el resto del archivo, ver
// nota debajo): un `import` estático de `cotizacion.service.js` a nivel de módulo se evalúa
// ANTES de que cualquier mock se registre, así que carga la cadena real de repositories →
// `config/supabase.js`, que revienta si no hay SUPABASE_URL/SUPABASE_SERVICE_KEY reales — pasaba
// desapercibido en local (hay `.env` con credenciales reales) pero rompía CI (sin `.env`).
describe('resolverDescuentos', () => {
  const PLAN_SIN_DESCUENTO_DEFAULT = { descuento_default: null, cotizacion_combinada: false }
  const PLAN_MRC_10 = { descuento_default: 10, cotizacion_combinada: false }
  const PLAN_AUTO_COMBINADO = { descuento_default: 20, cotizacion_combinada: true }

  function mockRepositoriosYObtenerResolverDescuentos(t, caso) {
    t.mock.module('../repositories/ramos.repository.js', { namedExports: {} })
    t.mock.module('../repositories/coberturas.repository.js', { namedExports: {} })
    t.mock.module('../repositories/cotizaciones.repository.js', { namedExports: {} })
    // cotizacion.service.js también importa tipo-cambio.service.js, que a su vez importa
    // tipos-cambio.repository.js -> config/supabase.js — sin este mock, el import dinámico de
    // más abajo sigue reventando en CI (sin .env) aunque los 3 repos de arriba estén mockeados.
    t.mock.module('./tipo-cambio.service.js', { namedExports: {} })
    return import(`./cotizacion.service.js?case=resolver-descuentos-${caso}`)
  }

  test('plan sin descuento_default: el body pasa intacto, forzadoPorPlan=false', async (t) => {
    const { resolverDescuentos } = await mockRepositoriosYObtenerResolverDescuentos(t, 1)
    const descuentosBody = [{ descripcion: 'Descuento agente', porcentaje: 15 }]
    const resultado = resolverDescuentos({
      plan: PLAN_SIN_DESCUENTO_DEFAULT,
      descuentosBody,
      usuario: { puede_editar_descuento_plan: false },
    })

    assert.deepEqual(resultado.descuentos, descuentosBody)
    assert.equal(resultado.forzadoPorPlan, false)
  })

  test('plan con descuento_default + usuario CON permiso: el body pasa intacto', async (t) => {
    const { resolverDescuentos } = await mockRepositoriosYObtenerResolverDescuentos(t, 2)
    const descuentosBody = [{ descripcion: 'Descuento agente', porcentaje: 5 }]
    const resultado = resolverDescuentos({
      plan: PLAN_MRC_10,
      descuentosBody,
      usuario: { puede_editar_descuento_plan: true },
    })

    assert.deepEqual(resultado.descuentos, descuentosBody)
    assert.equal(resultado.forzadoPorPlan, false)
  })

  test('plan con descuento_default + usuario SIN permiso: ignora el body, fuerza el 10% del plan', async (t) => {
    const { resolverDescuentos } = await mockRepositoriosYObtenerResolverDescuentos(t, 3)
    const descuentosBody = [{ descripcion: 'Descuento agente', porcentaje: 5 }]
    const resultado = resolverDescuentos({
      plan: PLAN_MRC_10,
      descuentosBody,
      usuario: { puede_editar_descuento_plan: false },
    })

    assert.deepEqual(resultado.descuentos, [{ descripcion: 'Descuento del plan', porcentaje: 10 }])
    assert.equal(resultado.forzadoPorPlan, true)
  })

  test('plan con descuento_default + usuario undefined (sin sesión mockeada): fuerza igual', async (t) => {
    const { resolverDescuentos } = await mockRepositoriosYObtenerResolverDescuentos(t, 4)
    const resultado = resolverDescuentos({
      plan: PLAN_MRC_10,
      descuentosBody: [{ porcentaje: 99 }],
      usuario: undefined,
    })

    assert.deepEqual(resultado.descuentos, [{ descripcion: 'Descuento del plan', porcentaje: 10 }])
    assert.equal(resultado.forzadoPorPlan, true)
  })

  test('plan Auto con cotizacion_combinada=true: NUNCA fuerza, aunque tenga descuento_default', async (t) => {
    const { resolverDescuentos } = await mockRepositoriosYObtenerResolverDescuentos(t, 5)
    const descuentosBody = [{ porcentaje: 3 }]
    const resultado = resolverDescuentos({
      plan: PLAN_AUTO_COMBINADO,
      descuentosBody,
      usuario: { puede_editar_descuento_plan: false },
    })

    assert.deepEqual(resultado.descuentos, descuentosBody)
    assert.equal(resultado.forzadoPorPlan, false)
  })

  test('plan con descuento_default + sin body (undefined): fuerza igual, no rompe', async (t) => {
    const { resolverDescuentos } = await mockRepositoriosYObtenerResolverDescuentos(t, 6)
    const resultado = resolverDescuentos({
      plan: PLAN_MRC_10,
      descuentosBody: undefined,
      usuario: { puede_editar_descuento_plan: false },
    })

    assert.deepEqual(resultado.descuentos, [{ descripcion: 'Descuento del plan', porcentaje: 10 }])
    assert.equal(resultado.forzadoPorPlan, true)
  })

  test('plan sin descuento_default + body undefined: devuelve array vacío, no rompe', async (t) => {
    const { resolverDescuentos } = await mockRepositoriosYObtenerResolverDescuentos(t, 7)
    const resultado = resolverDescuentos({
      plan: PLAN_SIN_DESCUENTO_DEFAULT,
      descuentosBody: undefined,
      usuario: { puede_editar_descuento_plan: false },
    })

    assert.deepEqual(resultado.descuentos, [])
    assert.equal(resultado.forzadoPorPlan, false)
  })
})

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

  function mockearRepositoriosMrc(t) {
    t.mock.module('../repositories/ramos.repository.js', {
      namedExports: {
        findPlanById: async () => PLAN_MRC_DESCUENTO_FIJO,
        findRamoById: async () => RAMO_MRC,
        findFormasPagoDelPlan: async () => FORMAS_PAGO_CONTADO_MRC,
        findCoberturasByPlanId: async () => [],
      },
    })
    t.mock.module('../repositories/coberturas.repository.js', {
      namedExports: {
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
    t.mock.module('./tipo-cambio.service.js', { namedExports: {} })
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

test('crearCotizacion con moneda:USD persiste moneda + snapshot de tipo de cambio vía un único RPC atómico', async (t) => {
  invalidarCacheCatalogos()
  const { cotizacionesCreadas } = mockearRepositorios(t)
  const { crearCotizacion } = await import('./cotizacion.service.js?case=crear-usd-snapshot')

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
  const { crearCotizacion } = await import('./cotizacion.service.js?case=crear-misma-moneda')

  await crearCotizacion(bodyBase({ moneda: 'PYG' }), USUARIO)

  assert.equal(cotizacionesCreadas.length, 1)
  const payload = cotizacionesCreadas[0]
  assert.equal(payload.p_cotizacion.moneda, 'PYG')
  assert.equal(payload.p_cotizacion.tipo_cambio_snapshot, undefined)
  assert.equal(payload.p_cotizacion.tipo_cambio_fuente, undefined)
  assert.equal(payload.p_cotizacion.tipo_cambio_fecha, undefined)
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
// reintento. Este test debe fallar (RED) contra la implementación actual: `crearCotizacion`
// todavía llama a `insertCotizacion`/`nextNumeroCorrelativo`/`deleteCotizacion` (funciones que
// ESTE mock ya no exporta), así que el error observado hoy no es `errorOriginal` sino un
// `TypeError` por invocar un export inexistente.
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

  const { crearCotizacion } = await import('./cotizacion.service.js?case=crear-rollback-error')

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
  // `actualizar_cotizacion_atomica`). Si `actualizarCotizacion` todavía los invoca, revienta
  // contra `undefined` en vez de resolver limpio — eso es lo que prueba el RED de este test.
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
    await import('./cotizacion.service.js?case=actualizar-usd-snapshot')

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
