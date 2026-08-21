import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>')
globalThis.document = dom.window.document
globalThis.window = dom.window

const { auth } = await import('../../shared/api.js')
const { state } = await import('../state.js')
const { renderResultadoView } = await import('./render-detalle-plan.js')

function cardForCoverage(documento, nombre) {
  return [...documento.querySelectorAll('.cobertura-card')].find(
    (card) => card.querySelector('.cobertura-card__name')?.textContent === nombre
  )
}

function setMrcQuoteState() {
  state.ramoId = 'mrc'
  state.planId = 1
  state.planes = [{ id: 1, nombre: 'MULTIRRIESGO COMERCIO - NORMAL' }]
  state.preview = {
    variantes: [{ formasPago: [{ codigo: 'contado', nombre_display: 'Contado', premio: 0 }] }],
    coberturas: [
      {
        codigo: 'sublimite_danos_agua',
        nombre: 'Daños por agua',
        monto: 2500000,
        tipo_aplicacion: 'sublimite',
        franquicia_default: 500000,
      },
      {
        codigo: 'sublimite_granizo',
        nombre: 'Daños por granizo',
        monto: 5000000,
        tipo_aplicacion: 'sublimite',
        franquicia_default: 800000,
      },
      {
        codigo: 'robo_valores_ventanilla',
        nombre: 'Robo valores ventanilla',
        monto: 300000,
        tipo_aplicacion: 'sublimite',
        franquicia_default: 500000,
      },
      {
        codigo: 'sublimite_equipos_electronicos',
        nombre: 'Daños a los Equipos Electrónicos',
        monto: 5000000,
        tipo_aplicacion: 'sublimite',
        franquicia_default: 800000,
      },
      {
        codigo: 'sublimite_murallas_cercos',
        nombre: 'Murallas y cercos',
        monto: 1000000,
        tipo_aplicacion: 'sublimite',
        franquicia_default: 500000,
      },
      {
        codigo: 'cristales',
        nombre: 'Cristales',
        monto: 1000000,
        tipo_aplicacion: 'cobertura',
        franquicia_default: 800000,
      },
    ],
  }
  state.planCoberturas = []
  state.coberturasAdicionales = []
  state.franquiciasPorCobertura = {}
}

test('renderResultadoView omits the four configured hidden MRC rows from plan details', () => {
  const getUsuarioOriginal = auth.getUsuario
  const estadoOriginal = {
    ramoId: state.ramoId,
    planId: state.planId,
    planes: state.planes,
    preview: state.preview,
    planCoberturas: state.planCoberturas,
    coberturasAdicionales: state.coberturasAdicionales,
    franquiciasPorCobertura: state.franquiciasPorCobertura,
  }

  setMrcQuoteState()

  try {
    for (const [rol, usuario] of [
      ['restricted', { rol: 'comercial', puede_seleccionar_franquicia: false }],
      ['authorized', { rol: 'analisis-riesgo', puede_seleccionar_franquicia: true }],
      ['admin', { rol: 'admin', puede_seleccionar_franquicia: true }],
    ]) {
      auth.getUsuario = () => usuario
      const html = renderResultadoView({ label: 'Multirriesgo Comercio' })
      const documento = new JSDOM(html).window.document

      for (const [codigo, nombre] of [
        ['sublimite_danos_agua', 'Daños por agua'],
        ['sublimite_granizo', 'Daños por granizo'],
        ['robo_valores_ventanilla', 'Robo valores ventanilla'],
        ['sublimite_equipos_electronicos', 'Daños a los Equipos Electrónicos'],
      ]) {
        assert.equal(cardForCoverage(documento, nombre), undefined, `${rol}: ${nombre}`)
        assert.doesNotMatch(html, new RegExp(codigo, 'u'), `${rol}: ${codigo}`)
      }

      assert.ok(cardForCoverage(documento, 'Murallas y cercos'), `${rol}: other sublimit remains`)
      assert.ok(cardForCoverage(documento, 'Cristales'), `${rol}: other coverage remains`)
    }
  } finally {
    auth.getUsuario = getUsuarioOriginal
    Object.assign(state, estadoOriginal)
  }
})

test('renderResultadoView muestra Sin deducible para un default NULL visible no especial', () => {
  const getUsuarioOriginal = auth.getUsuario
  const estadoOriginal = {
    ramoId: state.ramoId,
    planId: state.planId,
    planes: state.planes,
    preview: state.preview,
    planCoberturas: state.planCoberturas,
    coberturasAdicionales: state.coberturasAdicionales,
    franquiciasPorCobertura: state.franquiciasPorCobertura,
  }

  setMrcQuoteState()
  state.preview.coberturas.find(
    (cobertura) => cobertura.codigo === 'cristales'
  ).franquicia_default = null
  auth.getUsuario = () => ({ rol: 'comercial', puede_seleccionar_franquicia: false })

  try {
    const documento = new JSDOM(renderResultadoView({ label: 'Multirriesgo Comercio' })).window
      .document
    assert.match(
      cardForCoverage(documento, 'Cristales')?.textContent ?? '',
      /Franquicia: Sin deducible/
    )
  } finally {
    auth.getUsuario = getUsuarioOriginal
    Object.assign(state, estadoOriginal)
  }
})

test('renderResultadoView preserves deductible visibility for remaining MRC rows by permission', () => {
  const getUsuarioOriginal = auth.getUsuario
  const estadoOriginal = {
    ramoId: state.ramoId,
    planId: state.planId,
    planes: state.planes,
    preview: state.preview,
    planCoberturas: state.planCoberturas,
    coberturasAdicionales: state.coberturasAdicionales,
    franquiciasPorCobertura: state.franquiciasPorCobertura,
  }

  setMrcQuoteState()

  try {
    for (const [rol, usuario, esperaSelector] of [
      ['restricted', { rol: 'comercial', puede_seleccionar_franquicia: false }, false],
      ['authorized', { rol: 'analisis-riesgo', puede_seleccionar_franquicia: true }, true],
      ['admin', { rol: 'admin', puede_seleccionar_franquicia: false }, true],
    ]) {
      auth.getUsuario = () => usuario
      const documento = new JSDOM(renderResultadoView({ label: 'Multirriesgo Comercio' })).window
        .document
      const card = cardForCoverage(documento, 'Cristales')
      const otherSublimit = cardForCoverage(documento, 'Murallas y cercos')

      assert.ok(card, `${rol}: other MRC coverage remains visible`)
      assert.ok(otherSublimit, `${rol}: other MRC sublimit remains visible`)
      assert.equal(Boolean(card.querySelector('select')), esperaSelector, rol)
      assert.equal(Boolean(otherSublimit.querySelector('select')), esperaSelector, rol)
      if (esperaSelector) {
        assert.match(card.textContent, /Franquicia/)
        assert.equal(card.querySelector('select')?.dataset.franquiciaCobertura, 'cristales')
        assert.equal(card.querySelector('option[value="sin_deducible"]'), null)
        assert.equal(card.querySelector('select')?.value, '10_800000')
      } else {
        assert.match(
          card.textContent,
          /Franquicia: 10% en todo y cada siniestro, mínimo Gs\. 800\.000/
        )
      }
    }
  } finally {
    auth.getUsuario = getUsuarioOriginal
    Object.assign(state, estadoOriginal)
  }
})
