import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { activarConTeclado } from './dom.js'

const { window } = new JSDOM('<!doctype html><html><body></body></html>')

function crearDiv() {
  return window.document.createElement('div')
}

function disparar(el, key) {
  const evento = new window.KeyboardEvent('keydown', { key, cancelable: true })
  el.dispatchEvent(evento)
  return evento
}

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
