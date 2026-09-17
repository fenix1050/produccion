import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { activarConTeclado, escapeHtml, renderBanner } from './dom.js'

const { window } = new JSDOM('<!doctype html><html><body></body></html>')

function crearDiv() {
  return window.document.createElement('div')
}

function disparar(el, key) {
  const evento = new window.KeyboardEvent('keydown', { key, cancelable: true })
  el.dispatchEvent(evento)
  return evento
}

test('escapeHtml escapes markup characters', () => {
  const malicious = '<img src=x onerror="alert(1)">'
  assert.equal(escapeHtml(malicious), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;')
})

test('renderBanner escapes text and allowlists its CSS modifier', () => {
  const container = window.document.createElement('div')
  container.innerHTML = renderBanner({ tipo: 'success', texto: '<img src=x onerror=alert(1)>' })
  const banner = container.firstElementChild

  assert.equal(banner.className, 'admin-banner admin-banner--success')
  assert.equal(banner.textContent, '<img src=x onerror=alert(1)>')
  assert.equal(banner.querySelector('img'), null)

  container.innerHTML = renderBanner({ tipo: '" onmouseover="alert(1)', texto: 'Mensaje' })
  assert.equal(container.firstElementChild.className, 'admin-banner')
  assert.equal(container.firstElementChild.attributes.length, 1)
})

test('activarConTeclado agrega tabindex y role=button a un elemento sin esos atributos', () => {
  const el = crearDiv()
  activarConTeclado(el, () => {})
  assert.equal(el.getAttribute('tabindex'), '0')
  assert.equal(el.getAttribute('role'), 'button')
})

test('activarConTeclado no pisa un tabindex/role ya presentes', () => {
  const el = crearDiv()
  el.setAttribute('tabindex', '-1')
  el.setAttribute('role', 'option')
  activarConTeclado(el, () => {})
  assert.equal(el.getAttribute('tabindex'), '-1')
  assert.equal(el.getAttribute('role'), 'option')
})

test('activarConTeclado dispara el handler con Enter', () => {
  const el = crearDiv()
  let llamado = false
  activarConTeclado(el, () => {
    llamado = true
  })
  disparar(el, 'Enter')
  assert.equal(llamado, true)
})

test('activarConTeclado dispara el handler con la barra espaciadora y evita el scroll de página', () => {
  const el = crearDiv()
  let llamado = false
  activarConTeclado(el, () => {
    llamado = true
  })
  const evento = disparar(el, ' ')
  assert.equal(llamado, true)
  assert.equal(evento.defaultPrevented, true)
})

test('activarConTeclado ignora otras teclas', () => {
  const el = crearDiv()
  let llamado = false
  activarConTeclado(el, () => {
    llamado = true
  })
  disparar(el, 'Tab')
  assert.equal(llamado, false)
})
