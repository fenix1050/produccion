import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>')
globalThis.document = dom.window.document
globalThis.window = dom.window

const { state } = await import('../state.js')
const { renderModalProgresoCarta } = await import('./render-shell.js')

function renderProgressModal(progress) {
  state.progresoCarta = progress
  return new JSDOM(renderModalProgresoCarta()).window.document
}

test('renderModalProgresoCarta keeps a terminal slot in every progress state', () => {
  const originalProgress = state.progresoCarta

  try {
    for (const [name, progress] of [
      ['active', { paso: 1, estado: 'activo' }],
      ['success', { paso: 3, estado: 'exito', pdfUrl: 'blob:offer' }],
      ['error', { paso: 2, estado: 'error', error: 'The PDF service did not respond.' }],
    ]) {
      const document = renderProgressModal(progress)
      const modal = document.querySelector('.progreso-carta-modal')
      const terminalSlot = modal?.querySelector('.progreso-terminal-slot')
      const terminalContent = terminalSlot?.querySelector('.progreso-terminal-slot__content')

      assert.ok(modal, `${name}: modal renders`)
      assert.ok(terminalSlot, `${name}: terminal slot renders`)
      assert.equal(modal.lastElementChild, terminalSlot, `${name}: terminal slot remains in place`)
      assert.equal(
        terminalSlot.firstElementChild,
        terminalContent,
        `${name}: terminal content keeps the same nested structure`
      )
      assert.ok(modal.querySelector('#progreso-carta-title'), `${name}: title remains labelled`)
    }
  } finally {
    state.progresoCarta = originalProgress
  }
})

test('renderModalProgresoCarta preserves active, success, and error controls', () => {
  const originalProgress = state.progresoCarta

  try {
    const active = renderProgressModal({ paso: 1, estado: 'activo' })
    assert.equal(active.querySelector('.progreso-resultado'), null)
    assert.equal(active.querySelector('.admin-modal__actions'), null)
    assert.equal(active.querySelector('.progreso-terminal-slot__content')?.children.length, 0)

    const success = renderProgressModal({ paso: 3, estado: 'exito', pdfUrl: 'blob:offer' })
    assert.equal(success.querySelector('.progreso-resultado')?.getAttribute('role'), 'status')
    assert.equal(success.querySelector('.progreso-terminal-slot__content')?.children.length, 2)
    assert.ok(success.querySelector('[data-action="cerrar-modal-progreso-carta"]'))
    assert.ok(success.querySelector('[data-action="ver-pdf-carta"]'))

    const error = renderProgressModal({
      paso: 2,
      estado: 'error',
      error: 'The PDF service did not respond.',
    })
    assert.equal(error.querySelector('.progreso-resultado')?.getAttribute('role'), 'alert')
    assert.equal(error.querySelector('.progreso-terminal-slot__content')?.children.length, 2)
    assert.ok(error.querySelector('[data-action="cerrar-modal-progreso-carta"]'))
    assert.ok(error.querySelector('[data-action="reintentar-carta"]'))
  } finally {
    state.progresoCarta = originalProgress
  }
})

test('Carta Oferta terminal space and dark CTA contrast stay scoped', async () => {
  const cotizadorCss = await readFile(
    new URL('../../shared/cotizador.css', import.meta.url),
    'utf8'
  )
  const darkThemeCss = await readFile(
    new URL('../../shared/theme-dark.css', import.meta.url),
    'utf8'
  )

  assert.match(
    cotizadorCss,
    /\.progreso-terminal-slot\s*\{[^}]*block-size:\s*147\.75px;[^}]*overflow-y:\s*auto;/s
  )
  assert.match(
    darkThemeCss,
    /html\[data-theme='dark'\] \.progreso-carta-modal \.resumen-sistema__cta\s*\{[^}]*background:\s*var\(--tajy-red-active\);[^}]*color:\s*#fff;/s
  )
})
