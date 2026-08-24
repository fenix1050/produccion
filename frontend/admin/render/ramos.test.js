import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>')
globalThis.document = dom.window.document
globalThis.window = dom.window

const { state } = await import('../state.js')
const { renderRamosGestion } = await import('./ramos.js')

test('renderRamosGestion exposes clear state and explicit visibility actions', () => {
  const originalRamos = state.ramosGestion
  const originalLoading = state.loadingRamosGestion
  const originalError = state.ramosGestionError

  try {
    state.loadingRamosGestion = false
    state.ramosGestionError = ''
    state.ramosGestion = [
      { id: 1, nombre_display: 'Multirriesgo Comercio', activo: true },
      { id: 2, nombre_display: 'Multirriesgo Hogar', activo: false },
    ]

    const document = new JSDOM(renderRamosGestion()).window.document
    const buttons = document.querySelectorAll('[data-action="toggle-ramo-activo"]')

    assert.equal(document.body.textContent.includes('Visible en cotizador'), true)
    assert.equal(document.body.textContent.includes('Oculto del cotizador'), true)
    assert.equal(buttons.length, 2)
    assert.equal(buttons[0].tagName, 'BUTTON')
    assert.equal(buttons[0].type, 'button')
    assert.equal(buttons[0].textContent.trim(), 'Ocultar')
    assert.equal(buttons[0].dataset.nextActivo, 'false')
    assert.equal(buttons[1].textContent.trim(), 'Mostrar')
    assert.equal(buttons[1].dataset.nextActivo, 'true')
    assert.equal(document.querySelector('input[type="checkbox"]'), null)
  } finally {
    state.ramosGestion = originalRamos
    state.loadingRamosGestion = originalLoading
    state.ramosGestionError = originalError
  }
})
