import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>')
globalThis.document = dom.window.document
globalThis.window = dom.window

const { auth } = await import('../../shared/api.js')
const { state } = await import('../state.js')
const { renderFranquiciaSelect } = await import('./render-detalle-plan.js')

test('renderFranquiciaSelect does not overwrite a historical mandatory sublimit snapshot', () => {
  const getUsuarioOriginal = auth.getUsuario
  auth.getUsuario = () => ({ rol: 'admin', puede_seleccionar_franquicia: true })
  state.franquiciasPorCobertura = { robo_valores_ventanilla: 'sin_deducible' }

  try {
    const html = renderFranquiciaSelect({
      codigo: 'robo_valores_ventanilla',
      franquicia_default: null,
    })

    assert.match(html, /Franquicia obligatoria: 10% en todo y cada siniestro, mínimo Gs\. 500\.000/)
    assert.doesNotMatch(html, /<select/)
    assert.equal(state.franquiciasPorCobertura.robo_valores_ventanilla, 'sin_deducible')
  } finally {
    auth.getUsuario = getUsuarioOriginal
  }
})

test('renderFranquiciaSelect muestra el default de catálogo sin selector para usuarios sin permiso', () => {
  const getUsuarioOriginal = auth.getUsuario
  auth.getUsuario = () => ({ rol: 'comercial', puede_seleccionar_franquicia: false })

  try {
    const casos = [
      { codigo: 'sublimite_danos_agua', franquicia_default: null, etiqueta: 'Sin deducible' },
      { codigo: 'sublimite_granizo', franquicia_default: null, etiqueta: 'Sin deducible' },
      {
        codigo: 'cristales',
        franquicia_default: 500_000,
        etiqueta: '10% en todo y cada siniestro, mínimo Gs. 500.000',
      },
      {
        codigo: 'responsabilidad_civil',
        franquicia_default: 500_000,
        etiqueta: '10% en todo y cada siniestro, mínimo Gs. 500.000',
      },
    ]

    for (const cobertura of casos) {
      const html = renderFranquiciaSelect(cobertura)
      assert.match(html, new RegExp(cobertura.etiqueta.replaceAll('.', '\\.'), 'u'))
      assert.doesNotMatch(html, /<select/)
    }
  } finally {
    auth.getUsuario = getUsuarioOriginal
  }
})
