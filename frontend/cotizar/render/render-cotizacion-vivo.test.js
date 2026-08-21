import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>')
globalThis.document = dom.window.document
globalThis.window = dom.window

const { state } = await import('../state.js')
const { renderSublimitesFijosMrc } = await import('./render-cotizacion-vivo.js')

test('renderSublimitesFijosMrc keeps the three hidden plan-detail sublimits in the live quote', () => {
  const originalState = {
    planCoberturas: state.planCoberturas,
    coberturasAdicionales: state.coberturasAdicionales,
    coberturasCatalogo: state.coberturasCatalogo,
  }

  state.planCoberturas = [
    ['sublimite_danos_agua', 'Daños por agua', 2500000],
    ['sublimite_granizo', 'Daños por granizo', 5000000],
    ['sublimite_equipos_electronicos', 'Daños a los Equipos Electrónicos', 5000000],
  ].map(([codigo, nombre, monto]) => ({
    incluida_por_defecto: true,
    monto,
    coberturas_catalogo: { codigo, nombre, categoria: 'Sublímites' },
  }))
  state.coberturasAdicionales = []
  state.coberturasCatalogo = []

  try {
    const html = renderSublimitesFijosMrc()

    assert.match(html, /Daños por agua/)
    assert.match(html, /Daños por granizo/)
    assert.match(html, /Daños a los Equipos Electrónicos/)
    assert.match(html, /2\.500\.000 Gs\./)
    assert.equal((html.match(/5\.000\.000 Gs\./g) ?? []).length, 2)
  } finally {
    Object.assign(state, originalState)
  }
})
