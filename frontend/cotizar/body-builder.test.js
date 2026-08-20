// Tests de caracterización (approval tests) de body-builder.js — documentan el comportamiento
// ACTUAL del módulo, no un comportamiento deseado. Si un assert falla contra el código real, se
// corrige el TEST, nunca body-builder.js (ver openspec/changes/cotizacion-modularizacion).
//
// Mismo bootstrap de JSDOM que domain-rules.test.js (ver design.md, decisión 1) — state.js
// ejecuta `document.getElementById('app')` al tope del módulo.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>')
globalThis.document = dom.window.document
globalThis.window = dom.window

const { state } = await import('./state.js')
const { prefillDatosDesdeCotizacion, idLinea, armarRiesgoDatos } = await import('./body-builder.js')

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
// armarRiesgoDatos — mrc
// ---------------------------------------------------------------------------

test('armarRiesgoDatos en mrc arma cédula/dirección/rubro/ciudad/capitales y coberturas_adicionales con fijos primero', () => {
  state.ramoId = 'mrc'
  state.data = {
    cedula: '4.123.456',
    direccion: 'Av. España 1234',
    rubroActividad: 'Comercio',
    ciudad: 'Asunción',
    capitalEdificio: '100000000',
    capitalContenido: '20000000',
  }
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
  ]
  state.coberturasAdicionales = [
    { id: '1', codigo: 'robo_contenido', sumaAsegurada: 3000000 },
    { id: '2', codigo: '', sumaAsegurada: 1000000 },
    { id: '3', codigo: 'cristales', sumaAsegurada: 0 },
  ]
  state.franquiciasPorCobertura = { robo_contenido: '10_500000' }

  const resultado = armarRiesgoDatos({ nombre: 'PLAN COMERCIO' })

  assert.equal(resultado.cedula, '4.123.456')
  assert.equal(resultado.direccion, 'Av. España 1234')
  assert.equal(resultado.rubro_actividad, 'Comercio')
  assert.equal(resultado.ciudad, 'Asunción')
  assert.equal(resultado.capital_edificio, 100000000)
  assert.equal(resultado.capital_contenido, 20000000)
  assert.deepEqual(resultado.coberturas_adicionales, [
    { codigo: 'sublimite_danos_agua', suma_asegurada: 5000000 },
    { codigo: 'robo_contenido', suma_asegurada: 3000000 },
  ])
  assert.deepEqual(resultado.franquicias_por_cobertura, {})
})

// ---------------------------------------------------------------------------
// armarRiesgoDatos — incendio
// ---------------------------------------------------------------------------

test('armarRiesgoDatos en incendio MAQUINARIA BASICO omite sublimite_vandalismo_porcentaje en blanco', () => {
  state.ramoId = 'incendio'
  state.data = { capitalMaquinaria: '50000', sublimiteVandalismoPorcentaje: '' }
  const resultado = armarRiesgoDatos({ nombre: 'MAQUINARIA BASICO' })
  assert.deepEqual(resultado, { capital_maquinaria: 50000 })
})

test('armarRiesgoDatos en incendio MAQUINARIA BASICO incluye sublimite_vandalismo_porcentaje cuando viene cargado', () => {
  state.ramoId = 'incendio'
  state.data = { capitalMaquinaria: '50000', sublimiteVandalismoPorcentaje: '15' }
  const resultado = armarRiesgoDatos({ nombre: 'MAQUINARIA BASICO' })
  assert.deepEqual(resultado, { capital_maquinaria: 50000, sublimite_vandalismo_porcentaje: 15 })
})

// CARACTERIZACIÓN: los 4 objetos de riesgo se mandan siempre, con 0 para los no declarados —
// duplica el criterio de calcularPorObjetoRiesgo en incendio.calculator.js (solo suma > 0).
test('[CARACTERIZACIÓN] armarRiesgoDatos en incendio objeto_riesgo completa con 0 los objetos no declarados', () => {
  state.ramoId = 'incendio'
  state.data = { rubroActividad: 'Depósito', capitalEdificio: '1000' }
  const resultado = armarRiesgoDatos({ nombre: 'HIPOTECARIO', tipo_mecanica: 'objeto_riesgo' })
  assert.deepEqual(resultado, {
    rubro_actividad: 'Depósito',
    capital_edificio: 1000,
    capital_instalaciones: 0,
    capital_contenido_mueble_equipos: 0,
    capital_contenido_mercaderia: 0,
  })
})

test('armarRiesgoDatos en incendio rama default arma rubro/capitales y sublímite de fenómenos naturales', () => {
  state.ramoId = 'incendio'
  state.data = {
    rubroActividad: 'Comercio',
    capitalEdificio: '10000000',
    capitalContenido: '5000000',
    sublimiteFenomenosNaturalesPorcentaje: '20',
  }
  const resultado = armarRiesgoDatos({ nombre: 'INCENDIO ESTANDAR' })
  assert.deepEqual(resultado, {
    rubro_actividad: 'Comercio',
    capital_edificio: 10000000,
    capital_contenido: 5000000,
    sublimite_fenomenos_naturales_porcentaje: 20,
  })
})

// ---------------------------------------------------------------------------
// armarRiesgoDatos — vida-ap
// ---------------------------------------------------------------------------

test('armarRiesgoDatos en vida-ap PROTECCION FAMILIAR solo manda capital_asegurado', () => {
  state.ramoId = 'vida-ap'
  state.data = { capitalAsegurado: '50000000', edad: 30 }
  const resultado = armarRiesgoDatos({ nombre: 'PROTECCION FAMILIAR' })
  assert.deepEqual(resultado, { capital_asegurado: 50000000 })
})

test('armarRiesgoDatos en vida-ap Accidentes Personales omite renta diaria si no está marcada', () => {
  state.ramoId = 'vida-ap'
  state.data = { capitalAsegurado: '50000000', edad: 30, incluyeRentaDiaria: false }
  const resultado = armarRiesgoDatos({ nombre: 'ACCIDENTES PERSONALES - SECTOR PRIVADO' })
  assert.deepEqual(resultado, { capital_asegurado: 50000000, edad: 30 })
})

test('armarRiesgoDatos en vida-ap Accidentes Personales incluye renta diaria cuando está marcada', () => {
  state.ramoId = 'vida-ap'
  state.data = {
    capitalAsegurado: '50000000',
    edad: 30,
    incluyeRentaDiaria: true,
    sumaRentaDiaria: '200000',
  }
  const resultado = armarRiesgoDatos({ nombre: 'ACCIDENTES PERSONALES - SECTOR COOPERATIVO' })
  assert.deepEqual(resultado, {
    capital_asegurado: 50000000,
    edad: 30,
    incluye_renta_diaria: true,
    suma_renta_diaria: 200000,
  })
})

// CARACTERIZACIÓN: `Number(d.edad) || null` convierte edad=0 en null en vez de preservar 0 —
// caso borde de precedencia entre falsy y "no cargado", deferido al change cotizacion-contrato-fe-be.
test('[CARACTERIZACIÓN] armarRiesgoDatos en vida-ap convierte edad 0 en null', () => {
  state.ramoId = 'vida-ap'
  state.data = { capitalAsegurado: '50000000', edad: 0 }
  const resultado = armarRiesgoDatos({ nombre: 'VIDA DIRECTIVOS Y EMPLEADOS' })
  assert.deepEqual(resultado, { capital_asegurado: 50000000, edad: null })
})

// ---------------------------------------------------------------------------
// armarRiesgoDatos — barrera de alcance (auto)
// ---------------------------------------------------------------------------

test('armarRiesgoDatos devuelve {} para ramos sin builder (auto) — barrera que mantiene Auto fuera de alcance', () => {
  state.ramoId = 'auto'
  assert.deepEqual(armarRiesgoDatos({ nombre: 'cualquiera' }), {})
})

// ---------------------------------------------------------------------------
// prefillDatosDesdeCotizacion
// ---------------------------------------------------------------------------

test('prefillDatosDesdeCotizacion en mrc restaura los mismos campos que arma armarRiesgoDatos (round-trip)', () => {
  const cotizacion = {
    cliente_nombre: 'Juan Pérez',
    moneda: 'PYG',
    riesgo_datos: {
      cedula: '4.123.456',
      direccion: 'Av. España 1234',
      rubro_actividad: 'Comercio',
      ciudad: 'Asunción',
      capital_edificio: 100000000,
      capital_contenido: 20000000,
      coberturas_adicionales: [{ codigo: 'robo_contenido', suma_asegurada: 3000000 }],
      franquicias_por_cobertura: { robo_contenido: 500000 },
    },
    cotizacion_variantes: [],
  }

  // prefillDatosDesdeCotizacion() solo escribe state.data/state.coberturasAdicionales/
  // state.franquiciasPorCobertura — NO toca state.ramoId (lo setea selectRamo() en actions.js
  // antes de llegar acá) — hace falta setearlo a mano para poder reconstruir con armarRiesgoDatos.
  state.ramoId = 'mrc'
  prefillDatosDesdeCotizacion('mrc', { nombre: 'PLAN COMERCIO' }, cotizacion)

  assert.equal(state.data.clienteNombre, 'Juan Pérez')
  assert.equal(state.data.moneda, 'PYG')
  assert.equal(state.data.cedula, '4.123.456')
  assert.equal(state.data.direccion, 'Av. España 1234')
  assert.equal(state.data.rubroActividad, 'Comercio')
  assert.equal(state.data.ciudad, 'Asunción')
  assert.equal(state.data.capitalEdificio, 100000000)
  assert.equal(state.data.capitalContenido, 20000000)
  assert.equal(state.coberturasAdicionales.length, 1)
  assert.equal(state.coberturasAdicionales[0].codigo, 'robo_contenido')
  assert.equal(state.coberturasAdicionales[0].sumaAsegurada, 3000000)
  assert.equal(state.franquiciasPorCobertura.robo_contenido, '10_500000')

  const reconstruido = armarRiesgoDatos({ nombre: 'PLAN COMERCIO' })
  assert.equal(reconstruido.cedula, cotizacion.riesgo_datos.cedula)
  assert.equal(reconstruido.capital_edificio, cotizacion.riesgo_datos.capital_edificio)
  assert.deepEqual(
    reconstruido.coberturas_adicionales,
    cotizacion.riesgo_datos.coberturas_adicionales
  )
})

// Regresión issue #285: prefillDatosDesdeCotizacion reasigna state.franquiciasPorCobertura por
// completo (igual que coberturasAdicionales) — una franquicia de una carga anterior no debe
// sobrevivir si la cotización nueva no la trae.
test('prefillDatosDesdeCotizacion en mrc limpia franquiciasPorCobertura de una carga anterior', () => {
  state.franquiciasPorCobertura = { cristales: '10_800000' }
  const cotizacion = {
    cliente_nombre: 'Ana',
    moneda: 'PYG',
    riesgo_datos: {
      franquicias_por_cobertura: { robo_contenido: 500000 },
    },
    cotizacion_variantes: [],
  }

  prefillDatosDesdeCotizacion('mrc', { nombre: 'PLAN COMERCIO' }, cotizacion)

  assert.deepEqual(state.franquiciasPorCobertura, {
    robo_contenido: '10_500000',
  })
})

test('prefillDatosDesdeCotizacion en mrc preserves mandatory sublimit franchise snapshots', () => {
  const cotizacion = {
    cliente_nombre: 'Ana',
    moneda: 'PYG',
    riesgo_datos: {
      coberturas_adicionales: [
        { codigo: 'robo_valores_ventanilla', suma_asegurada: 300000 },
        { codigo: 'sublimite_equipos_electronicos', suma_asegurada: 5000000 },
      ],
      franquicias_por_cobertura: {
        robo_valores_ventanilla: null,
        sublimite_equipos_electronicos: 800000,
      },
    },
    cotizacion_coberturas: [
      {
        franquicia: null,
        coberturas_catalogo: { codigo: 'robo_valores_ventanilla' },
      },
      {
        franquicia: 800000,
        coberturas_catalogo: { codigo: 'sublimite_equipos_electronicos' },
      },
    ],
    cotizacion_variantes: [],
  }

  prefillDatosDesdeCotizacion('mrc', { nombre: 'PLAN COMERCIO' }, cotizacion)

  assert.equal(state.franquiciasPorCobertura.robo_valores_ventanilla, 'sin_deducible')
  assert.equal(state.franquiciasPorCobertura.sublimite_equipos_electronicos, '10_800000')
})

test('prefillDatosDesdeCotizacion en incendio MAQUINARIA BASICO restaura capital y sublímite condicional', () => {
  const cotizacion = {
    cliente_nombre: 'Pedro',
    moneda: 'USD',
    riesgo_datos: { capital_maquinaria: 60000, sublimite_vandalismo_porcentaje: 12 },
    cotizacion_variantes: [],
  }
  prefillDatosDesdeCotizacion('incendio', { nombre: 'MAQUINARIA BASICO' }, cotizacion)

  assert.equal(state.data.capitalMaquinaria, 60000)
  assert.equal(state.data.sublimiteVandalismoPorcentaje, 12)
})

test('prefillDatosDesdeCotizacion en vida-ap restaura renta diaria solo si venía incluida', () => {
  const cotizacion = {
    cliente_nombre: 'Lucía',
    moneda: 'PYG',
    riesgo_datos: {
      capital_asegurado: 50000000,
      edad: 40,
      incluye_renta_diaria: true,
      suma_renta_diaria: 300000,
    },
    cotizacion_variantes: [],
  }
  prefillDatosDesdeCotizacion(
    'vida-ap',
    { nombre: 'ACCIDENTES PERSONALES - SECTOR PRIVADO' },
    cotizacion
  )

  assert.equal(state.data.capitalAsegurado, 50000000)
  assert.equal(state.data.edad, 40)
  assert.equal(state.data.incluyeRentaDiaria, true)
  assert.equal(state.data.sumaRentaDiaria, 300000)
})

// ---------------------------------------------------------------------------
// idLinea
// ---------------------------------------------------------------------------

test('idLinea genera ids únicos', () => {
  const a = idLinea()
  const b = idLinea()
  assert.notEqual(a, b)
})

test('idLinea usa el fallback `linea-<timestamp>-<random>` cuando crypto.randomUUID no está disponible', () => {
  const originalRandomUUID = crypto.randomUUID
  Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
  try {
    const id = idLinea()
    assert.match(id, /^linea-\d+-[a-z0-9]+$/)
  } finally {
    Object.defineProperty(crypto, 'randomUUID', { value: originalRandomUUID, configurable: true })
  }
})
