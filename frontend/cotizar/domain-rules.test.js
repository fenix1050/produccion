// Tests de caracterización (approval tests) de domain-rules.js — documentan el comportamiento
// ACTUAL del módulo, no un comportamiento deseado. Si un assert falla contra el código real, se
// corrige el TEST, nunca domain-rules.js (ver openspec/changes/cotizacion-modularizacion).
//
// state.js ejecuta `document.getElementById('app')` al tope del módulo (import de nivel top), así
// que hace falta un `document` global ANTES del `await import()` — de ahí el bootstrap de JSDOM
// acá arriba en vez de un test-setup.js compartido (ver design.md, decisión 1).
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>')
globalThis.document = dom.window.document
globalThis.window = dom.window

const { state } = await import('./state.js')
const {
  planEsCalculable,
  monedaEfectiva,
  datosMinimosCompletos,
  capitalAseguradoParaBody,
  sugerenciaInspeccion,
  puedeAvanzarADetalle,
  sumaObjetoRiesgo,
  franquiciaValorPorDefecto,
  franquiciasPorCoberturaParaBody,
  puedeSeleccionarFranquicia,
  FRANQUICIA_MRC_OBLIGATORIA_MONTO,
  ajustesParaBody,
  sublimiteVentanillaCalculado,
  sublimitesFijosMrc,
  coberturasPrincipalesFijasMrc,
  capitalTotalAsegurado,
  formasPagoDisponibles,
  formaPagoSeleccionada,
  quedanCoberturasAdicionalesPorAgregar,
} = await import('./domain-rules.js')
const { armarRiesgoDatos } = await import('./body-builder.js')

// state es un singleton mutable exportado por state.js — sin reset, el orden de ejecución de
// los tests produciría falsos verdes/rojos según qué corrió antes (design.md, decisión 2).
function resetState() {
  state.ramoId = null
  state.planId = null
  state.planes = []
  state.data = {}
  state.preview = null
  state.previewError = null
  state.formaPagoCodigo = null
  state.franquiciasPorCobertura = {}
  state.coberturasCatalogo = []
  state.planCoberturas = []
  state.coberturasAdicionales = []
  state.coberturasAdicionalesEditando = new Set()
}

beforeEach(resetState)

// ---------------------------------------------------------------------------
// planEsCalculable
// ---------------------------------------------------------------------------

test('planEsCalculable devuelve false si el plan es null', () => {
  assert.equal(planEsCalculable('mrc', null), false)
})

// CARACTERIZACIÓN: para vida-ap, planEsCalculable usa la lista fija PLANES_VIDA_AP_CALCULABLES
// e ignora por completo prima_tecnica_minima — a diferencia de MRC/Incendio, que sí la usan.
// Esto es una duplicación conocida frontend/backend (ver vida-ap.calculator.js
// PLANES_NO_IMPLEMENTADOS), deferida al change cotizacion-contrato-fe-be.
test('[CARACTERIZACIÓN] planEsCalculable en vida-ap usa la lista fija, ignora prima_tecnica_minima', () => {
  const dentroDeLista = { nombre: 'PROTECCION FAMILIAR', prima_tecnica_minima: null }
  const fueraDeLista = { nombre: 'PLAN NO SEEDEADO', prima_tecnica_minima: 500000 }
  assert.equal(planEsCalculable('vida-ap', dentroDeLista), true)
  assert.equal(planEsCalculable('vida-ap', fueraDeLista), false)
})

test('planEsCalculable en mrc/incendio depende solo de prima_tecnica_minima != null', () => {
  assert.equal(planEsCalculable('mrc', { prima_tecnica_minima: 0 }), true)
  assert.equal(planEsCalculable('mrc', { prima_tecnica_minima: null }), false)
  assert.equal(planEsCalculable('incendio', { prima_tecnica_minima: 1200000 }), true)
  assert.equal(planEsCalculable('incendio', {}), false)
})

// ---------------------------------------------------------------------------
// monedaEfectiva
// ---------------------------------------------------------------------------

// CARACTERIZACIÓN: MAQUINARIA BASICO queda fijo en USD sin importar tipo_mecanica — incluso si
// alguna vez se le asignara 'objeto_riesgo' (rama que normalmente lee state.data.moneda), el
// chequeo de nombre gana primero.
test('[CARACTERIZACIÓN] monedaEfectiva fija USD para MAQUINARIA BASICO sin importar tipo_mecanica', () => {
  state.data.moneda = 'PYG'
  assert.equal(
    monedaEfectiva({ nombre: 'MAQUINARIA BASICO', tipo_mecanica: 'objeto_riesgo' }),
    'USD'
  )
  assert.equal(monedaEfectiva({ nombre: 'MAQUINARIA BASICO' }), 'USD')
})

test('monedaEfectiva en planes objeto_riesgo usa state.data.moneda o PYG por defecto', () => {
  state.data.moneda = 'USD'
  assert.equal(monedaEfectiva({ nombre: 'HIPOTECARIO', tipo_mecanica: 'objeto_riesgo' }), 'USD')
  state.data.moneda = undefined
  assert.equal(monedaEfectiva({ nombre: 'HIPOTECARIO', tipo_mecanica: 'objeto_riesgo' }), 'PYG')
})

test('monedaEfectiva vuelve a PYG para el resto de los planes, incluido plan null', () => {
  assert.equal(monedaEfectiva({ nombre: 'PLAN ESTANDAR', tipo_mecanica: 'capital' }), 'PYG')
  assert.equal(monedaEfectiva(null), 'PYG')
})

// ---------------------------------------------------------------------------
// datosMinimosCompletos
// ---------------------------------------------------------------------------

test('datosMinimosCompletos devuelve false fuera de RAMOS_CON_CALCULO o sin planId', () => {
  state.ramoId = 'auto'
  state.planId = 'plan-1'
  assert.equal(datosMinimosCompletos(), false)

  state.ramoId = 'mrc'
  state.planId = null
  assert.equal(datosMinimosCompletos(), false)
})

test('datosMinimosCompletos en mrc exige rubro, ciudad y capital declarado', () => {
  state.ramoId = 'mrc'
  state.planId = 'plan-mrc'
  state.planes = [{ id: 'plan-mrc', prima_tecnica_minima: 500000 }]
  state.data = { rubroActividad: 'Comercio', ciudad: 'Asunción', capitalEdificio: 100000000 }
  assert.equal(datosMinimosCompletos(), true)

  state.data = { rubroActividad: 'Comercio', ciudad: 'Asunción' }
  assert.equal(datosMinimosCompletos(), false)
})

// CARACTERIZACIÓN: en incendio, MAQUINARIA BASICO solo exige capitalMaquinaria > 0 (no rubro ni
// ciudad) y objeto_riesgo solo exige rubroActividad + suma declarada (no ciudad) — la rama
// default sí exige rubro + ciudad + capital, así que las 3 ramas de incendio NO son simétricas.
test('[CARACTERIZACIÓN] datosMinimosCompletos en incendio tiene 3 ramas asimétricas', () => {
  state.ramoId = 'incendio'
  state.planId = 'plan-maquinaria'
  state.planes = [{ id: 'plan-maquinaria', nombre: 'MAQUINARIA BASICO', prima_tecnica_minima: 0 }]
  state.data = { capitalMaquinaria: 50000 }
  assert.equal(datosMinimosCompletos(), true)

  state.planId = 'plan-objeto'
  state.planes = [
    {
      id: 'plan-objeto',
      nombre: 'HIPOTECARIO',
      tipo_mecanica: 'objeto_riesgo',
      prima_tecnica_minima: 0,
    },
  ]
  state.data = { rubroActividad: 'Comercio', capitalEdificio: 10000000 }
  assert.equal(datosMinimosCompletos(), true)

  state.planId = 'plan-default'
  state.planes = [{ id: 'plan-default', nombre: 'INCENDIO ESTANDAR', prima_tecnica_minima: 0 }]
  state.data = { rubroActividad: 'Comercio', capitalEdificio: 10000000 }
  assert.equal(
    datosMinimosCompletos(),
    false,
    'la rama default sí exige ciudad, a diferencia de las otras 2'
  )
})

test('datosMinimosCompletos en vida-ap: PROTECCION FAMILIAR no exige edad, el resto sí', () => {
  state.ramoId = 'vida-ap'
  state.planId = 'plan-familiar'
  state.planes = [{ id: 'plan-familiar', nombre: 'PROTECCION FAMILIAR' }]
  state.data = { capitalAsegurado: 50000000 }
  assert.equal(datosMinimosCompletos(), true)

  state.planId = 'plan-ap'
  state.planes = [{ id: 'plan-ap', nombre: 'ACCIDENTES PERSONALES - SECTOR PRIVADO' }]
  state.data = { capitalAsegurado: 50000000 }
  assert.equal(datosMinimosCompletos(), false)

  state.data = { capitalAsegurado: 50000000, edad: 30 }
  assert.equal(datosMinimosCompletos(), true)
})

// ---------------------------------------------------------------------------
// capitalAseguradoParaBody
// ---------------------------------------------------------------------------

test('capitalAseguradoParaBody suma edificio + contenido en mrc y devuelve 0 fuera de los 3 ramos', () => {
  state.ramoId = 'mrc'
  state.data = { capitalEdificio: 100000000, capitalContenido: 20000000 }
  assert.equal(capitalAseguradoParaBody({}), 120000000)

  state.ramoId = 'auto'
  assert.equal(capitalAseguradoParaBody({}), 0)
})

test('capitalAseguradoParaBody en incendio replica la misma asimetría por rama que datosMinimosCompletos', () => {
  state.ramoId = 'incendio'
  state.data = { capitalMaquinaria: 75000 }
  assert.equal(capitalAseguradoParaBody({ nombre: 'MAQUINARIA BASICO' }), 75000)

  state.data = {
    capitalEdificio: 1000,
    capitalInstalaciones: 2000,
    capitalContenidoMuebleEquipos: 3000,
    capitalContenidoMercaderia: 4000,
  }
  assert.equal(
    capitalAseguradoParaBody({ nombre: 'HIPOTECARIO', tipo_mecanica: 'objeto_riesgo' }),
    10000
  )
})

// ---------------------------------------------------------------------------
// Test de triage cruzada — corre el mismo plan objeto_riesgo por las 4 sedes de la duplicación
// (monedaEfectiva, datosMinimosCompletos, capitalAseguradoParaBody, armarRiesgoDatos) y afirma
// que coinciden. Baseline medible para el change deferido cotizacion-contrato-fe-be.
// ---------------------------------------------------------------------------

test('triage cruzada: un plan objeto_riesgo produce valores consistentes en las 4 sedes duplicadas', () => {
  const plan = { nombre: 'HIPOTECARIO', tipo_mecanica: 'objeto_riesgo' }
  state.ramoId = 'incendio'
  state.planId = 'plan-hipotecario'
  state.planes = [{ ...plan, id: 'plan-hipotecario', prima_tecnica_minima: 0 }]
  state.data = {
    moneda: 'USD',
    rubroActividad: 'Depósito',
    capitalEdificio: 1000,
    capitalInstalaciones: 500,
    capitalContenidoMuebleEquipos: 250,
    capitalContenidoMercaderia: 250,
  }

  assert.equal(monedaEfectiva(plan), 'USD')
  assert.equal(datosMinimosCompletos(), true)
  const capitalBody = capitalAseguradoParaBody(plan)
  assert.equal(capitalBody, 2000)

  const riesgoDatos = armarRiesgoDatos(plan)
  const sumaRiesgoDatos =
    riesgoDatos.capital_edificio +
    riesgoDatos.capital_instalaciones +
    riesgoDatos.capital_contenido_mueble_equipos +
    riesgoDatos.capital_contenido_mercaderia
  assert.equal(
    sumaRiesgoDatos,
    capitalBody,
    'capitalAseguradoParaBody y armarRiesgoDatos deben coincidir'
  )
})

// ---------------------------------------------------------------------------
// sugerenciaInspeccion
// ---------------------------------------------------------------------------

test('sugerenciaInspeccion devuelve null cuando no aplica (plan/tipo_mecanica/umbral ausentes)', () => {
  assert.equal(sugerenciaInspeccion(null), null)
  assert.equal(sugerenciaInspeccion({ tipo_mecanica: 'capital', requiere_inspeccion: true }), null)
  assert.equal(
    sugerenciaInspeccion({ tipo_mecanica: 'objeto_riesgo', requiere_inspeccion: null }),
    null
  )
  assert.equal(
    sugerenciaInspeccion({
      tipo_mecanica: 'objeto_riesgo',
      requiere_inspeccion: true,
      umbral_inspeccion_monto: null,
    }),
    null
  )
})

test('sugerenciaInspeccion devuelve null sin suma declarada o con moneda distinta a la cotización', () => {
  state.data = {}
  const plan = {
    tipo_mecanica: 'objeto_riesgo',
    requiere_inspeccion: true,
    umbral_inspeccion_monto: 1000000,
  }
  assert.equal(sugerenciaInspeccion(plan), null, 'sin suma declarada')

  state.data = { capitalEdificio: 2000000 }
  assert.equal(
    sugerenciaInspeccion({ ...plan, umbral_inspeccion_moneda: 'USD' }),
    null,
    'la cotización está en PYG, el umbral en USD'
  )
})

test('sugerenciaInspeccion devuelve null si el estado actual ya coincide con requiere_inspeccion', () => {
  state.data = { capitalEdificio: 2000000 }
  const planConInspeccion = {
    tipo_mecanica: 'objeto_riesgo',
    requiere_inspeccion: true,
    umbral_inspeccion_monto: 1000000,
  }
  // suma (2.000.000) >= umbral (1.000.000) === requiere_inspeccion (true) -> ya coincide
  assert.equal(sugerenciaInspeccion(planConInspeccion), null)
})

test('sugerenciaInspeccion sugiere pasar a "con Inspección" cuando la suma supera el umbral', () => {
  state.data = { capitalEdificio: 2000000 }
  const plan = {
    tipo_mecanica: 'objeto_riesgo',
    requiere_inspeccion: false,
    umbral_inspeccion_monto: 1000000,
  }
  const mensaje = sugerenciaInspeccion(plan)
  assert.match(mensaje, /con Inspección/)
})

test('sugerenciaInspeccion sugiere pasar a "sin Inspección" cuando la suma está por debajo del umbral', () => {
  state.data = { capitalEdificio: 500000 }
  const plan = {
    tipo_mecanica: 'objeto_riesgo',
    requiere_inspeccion: true,
    umbral_inspeccion_monto: 1000000,
  }
  const mensaje = sugerenciaInspeccion(plan)
  assert.match(mensaje, /sin Inspección/)
})

// ---------------------------------------------------------------------------
// puedeAvanzarADetalle
// ---------------------------------------------------------------------------

test('puedeAvanzarADetalle es true para ramos sin calculador y depende del preview en los otros', () => {
  state.ramoId = 'auto'
  assert.equal(puedeAvanzarADetalle(), true)

  state.ramoId = 'mrc'
  state.preview = null
  state.previewError = null
  assert.equal(puedeAvanzarADetalle(), false)

  state.preview = { variantes: [] }
  assert.equal(puedeAvanzarADetalle(), true)

  state.previewError = 'Capital por encima de la Responsabilidad Máxima Cotizable'
  assert.equal(puedeAvanzarADetalle(), false)
})

// ---------------------------------------------------------------------------
// sumaObjetoRiesgo / franquiciaValorPorDefecto / franquiciasPorCoberturaParaBody / ajustesParaBody
// ---------------------------------------------------------------------------

test('sumaObjetoRiesgo suma los 4 campos declarados y trata no-numéricos como 0', () => {
  state.data = {
    capitalEdificio: 1000,
    capitalInstalaciones: '2000',
    capitalContenidoMuebleEquipos: '',
    capitalContenidoMercaderia: undefined,
  }
  assert.equal(sumaObjetoRiesgo(), 3000)
})

test('franquiciaValorPorDefecto mapea el monto a la opción del catálogo o cae a sin_deducible', () => {
  assert.equal(franquiciaValorPorDefecto(0), 'sin_deducible')
  assert.equal(franquiciaValorPorDefecto(null), 'sin_deducible')
  assert.equal(franquiciaValorPorDefecto(800000), '10_800000')
  assert.equal(franquiciaValorPorDefecto(999999), 'sin_deducible')
})

// CARACTERIZACIÓN: un valor de franquicia no reconocido en FRANQUICIA_OPCIONES se traduce a
// `null`, exactamente el mismo monto que 'sin_deducible' — el backend no puede distinguir
// "sin deducible" de "valor de UI corrupto/desconocido".
test('[CARACTERIZACIÓN] franquiciasPorCoberturaParaBody traduce un valor desconocido a null', () => {
  state.franquiciasPorCobertura = { robo_contenido: '10_800000', cristales: 'valor-inexistente' }
  const resultado = franquiciasPorCoberturaParaBody()
  assert.deepEqual(resultado, { robo_contenido: 800000, cristales: null })
})

test('franquiciasPorCoberturaParaBody incluye solo los sublímites obligatorios sin permiso', () => {
  state.franquiciasPorCobertura = {
    cristales: '10_1200000',
    responsabilidad_civil: '10_500000',
    sublimite_danos_agua: '10_500000',
    sublimite_granizo: '10_500000',
  }
  assert.deepEqual(
    franquiciasPorCoberturaParaBody({
      codigosAplicables: [
        'cristales',
        'responsabilidad_civil',
        'sublimite_danos_agua',
        'sublimite_granizo',
        'robo_valores_ventanilla',
        'sublimite_equipos_electronicos',
      ],
      puedeSeleccionar: false,
    }),
    {
      robo_valores_ventanilla: 500000,
      sublimite_equipos_electronicos: 500000,
    }
  )
})

test('franquiciasPorCoberturaParaBody fuerza los sublímites obligatorios para un usuario autorizado y conserva las demás selecciones', () => {
  state.franquiciasPorCobertura = {
    robo_valores_ventanilla: 'sin_deducible',
    sublimite_equipos_electronicos: '10_800000',
    responsabilidad_civil: '10_800000',
  }

  const resultado = franquiciasPorCoberturaParaBody({
    codigosAplicables: [
      'robo_valores_ventanilla',
      'sublimite_equipos_electronicos',
      'responsabilidad_civil',
    ],
    puedeSeleccionar: true,
  })

  assert.deepEqual(resultado, {
    robo_valores_ventanilla: FRANQUICIA_MRC_OBLIGATORIA_MONTO,
    sublimite_equipos_electronicos: FRANQUICIA_MRC_OBLIGATORIA_MONTO,
    responsabilidad_civil: 800000,
  })
  assert.equal(state.franquiciasPorCobertura.robo_valores_ventanilla, '10_500000')
  assert.equal(state.franquiciasPorCobertura.sublimite_equipos_electronicos, '10_500000')
})

test('puedeSeleccionarFranquicia solo habilita admin o el permiso explícito', () => {
  assert.equal(puedeSeleccionarFranquicia({ rol: 'admin' }), true)
  assert.equal(puedeSeleccionarFranquicia({ rol: 'comercial' }), false)
  assert.equal(
    puedeSeleccionarFranquicia({ rol: 'analisis-riesgo', puede_seleccionar_franquicia: true }),
    true
  )
})

test('ajustesParaBody prioriza monto sobre porcentaje y devuelve [] fuera de RAMOS_CON_AJUSTES', () => {
  state.ramoId = 'mrc'
  state.data = { descuentoMonto: 100000, descuentoPorcentaje: 10 }
  assert.deepEqual(ajustesParaBody('descuento', 'Descuento aplicado por el agente'), [
    { descripcion: 'Descuento aplicado por el agente', monto: 100000 },
  ])

  state.data = { descuentoPorcentaje: 10 }
  assert.deepEqual(ajustesParaBody('descuento', 'Descuento aplicado por el agente'), [
    { descripcion: 'Descuento aplicado por el agente', porcentaje: 10 },
  ])

  state.ramoId = 'vida-ap'
  state.data = { descuentoMonto: 100000 }
  assert.deepEqual(ajustesParaBody('descuento', 'Descuento aplicado por el agente'), [])
})

// ---------------------------------------------------------------------------
// sublimiteVentanillaCalculado / sublimitesFijosMrc / coberturasPrincipalesFijasMrc /
// capitalTotalAsegurado / formasPagoDisponibles / formaPagoSeleccionada /
// quedanCoberturasAdicionalesPorAgregar (Tier 2)
// ---------------------------------------------------------------------------

test('sublimiteVentanillaCalculado devuelve null sin caja fuerte cargada, monto 30% con catálogo', () => {
  state.coberturasAdicionales = []
  assert.equal(sublimiteVentanillaCalculado(), null)

  state.coberturasAdicionales = [{ codigo: 'robo_caja_registradora', sumaAsegurada: 1000000 }]
  state.coberturasCatalogo = [
    { codigo: 'robo_valores_ventanilla', nombre: 'Robo Valores Ventanilla' },
  ]
  assert.deepEqual(sublimiteVentanillaCalculado(), {
    codigo: 'robo_valores_ventanilla',
    nombre: 'Robo Valores Ventanilla',
    monto: 300000,
  })
})

test('sublimiteVentanillaCalculado usa nombre fallback sin catálogo cargado', () => {
  state.coberturasAdicionales = [{ codigo: 'robo_caja_registradora', sumaAsegurada: 500000 }]
  state.coberturasCatalogo = []
  const resultado = sublimiteVentanillaCalculado()
  assert.equal(resultado.nombre, 'Robo valores ventanilla')
  assert.equal(resultado.monto, 150000)
})

test('sublimitesFijosMrc filtra por categoría Sublímites y excluye códigos base, Ventanilla al final', () => {
  state.planCoberturas = [
    {
      incluida_por_defecto: true,
      monto: 5000000,
      coberturas_catalogo: {
        codigo: 'sublimite_danos_agua',
        nombre: 'Daños por Agua',
        categoria: 'Sublímites',
      },
    },
    {
      incluida_por_defecto: true,
      monto: 1000000,
      coberturas_catalogo: {
        codigo: 'robo_contenido',
        nombre: 'Robo Contenido',
        categoria: 'Coberturas Principales',
      },
    },
    {
      incluida_por_defecto: true,
      monto: 2000000,
      coberturas_catalogo: {
        codigo: 'incendio_edificio',
        nombre: 'Incendio Edificio',
        categoria: 'Sublímites',
      },
    },
  ]
  state.coberturasAdicionales = [{ codigo: 'robo_caja_registradora', sumaAsegurada: 1000000 }]
  state.coberturasCatalogo = []
  const resultado = sublimitesFijosMrc()
  assert.deepEqual(resultado, [
    { codigo: 'sublimite_danos_agua', nombre: 'Daños por Agua', monto: 5000000 },
    { codigo: 'robo_valores_ventanilla', nombre: 'Robo valores ventanilla', monto: 300000 },
  ])
})

test('coberturasPrincipalesFijasMrc devuelve solo coberturas por defecto que no son Sublímites', () => {
  state.planCoberturas = [
    {
      incluida_por_defecto: true,
      coberturas_catalogo: {
        codigo: 'robo_contenido',
        nombre: 'Robo Contenido',
        categoria: 'Coberturas Principales',
      },
    },
    {
      incluida_por_defecto: true,
      coberturas_catalogo: {
        codigo: 'sublimite_danos_agua',
        nombre: 'Daños por Agua',
        categoria: 'Sublímites',
      },
    },
    {
      incluida_por_defecto: false,
      coberturas_catalogo: {
        codigo: 'cristales',
        nombre: 'Cristales',
        categoria: 'Coberturas Principales',
      },
    },
  ]
  assert.deepEqual(coberturasPrincipalesFijasMrc(), [
    { codigo: 'robo_contenido', nombre: 'Robo Contenido' },
  ])
})

test('capitalTotalAsegurado suma coberturas que cuentan, excluye sublímites y marcadas false', () => {
  state.preview = {
    coberturas: [
      { tipo_aplicacion: 'principal', monto: 1000000, incluye_en_suma_asegurada_total: true },
      { tipo_aplicacion: 'sublimite', monto: 500000, incluye_en_suma_asegurada_total: true },
      { tipo_aplicacion: 'principal', monto: 300000, incluye_en_suma_asegurada_total: false },
      { tipo_aplicacion: 'principal', monto: 200000 },
    ],
  }
  assert.equal(capitalTotalAsegurado(), 1200000)
})

test('capitalTotalAsegurado devuelve 0 sin preview', () => {
  state.preview = null
  assert.equal(capitalTotalAsegurado(), 0)
})

// CARACTERIZACIÓN: formasPagoDisponibles ordena según ORDEN_FORMAS_PAGO — un código fuera de esa
// lista devuelve indexOf -1 y queda primero, en vez de al final.
test('[CARACTERIZACIÓN] formasPagoDisponibles ordena por ORDEN_FORMAS_PAGO, código desconocido queda primero', () => {
  state.preview = {
    variantes: [
      {
        formasPago: [
          { codigo: 'tarjeta_credito' },
          { codigo: 'contado' },
          { codigo: 'codigo_desconocido' },
          { codigo: 'cobrador' },
        ],
      },
    ],
  }
  const resultado = formasPagoDisponibles().map((f) => f.codigo)
  assert.deepEqual(resultado, ['codigo_desconocido', 'contado', 'cobrador', 'tarjeta_credito'])
})

test('formasPagoDisponibles devuelve [] sin preview', () => {
  state.preview = null
  assert.deepEqual(formasPagoDisponibles(), [])
})

test('formaPagoSeleccionada devuelve la forma elegida en state.formaPagoCodigo o la primera por defecto', () => {
  state.preview = {
    variantes: [{ formasPago: [{ codigo: 'contado' }, { codigo: 'cobrador' }] }],
  }
  state.formaPagoCodigo = 'cobrador'
  assert.equal(formaPagoSeleccionada().codigo, 'cobrador')

  state.formaPagoCodigo = 'no_existe'
  assert.equal(formaPagoSeleccionada().codigo, 'contado')
})

test('formaPagoSeleccionada devuelve null sin formas disponibles', () => {
  state.preview = null
  assert.equal(formaPagoSeleccionada(), null)
})

test('quedanCoberturasAdicionalesPorAgregar compara la cantidad de líneas contra la capacidad total', () => {
  const catalogo = [{ codigo: 'robo_contenido' }, { codigo: 'cristales' }]
  state.coberturasAdicionales = [{ id: '1' }]
  assert.equal(quedanCoberturasAdicionalesPorAgregar(catalogo), true)

  state.coberturasAdicionales = [{ id: '1' }, { id: '2' }]
  assert.equal(quedanCoberturasAdicionalesPorAgregar(catalogo), false)
})
