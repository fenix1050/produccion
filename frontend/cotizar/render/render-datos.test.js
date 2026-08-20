import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>')
globalThis.document = dom.window.document
globalThis.window = dom.window

const { tiposRiesgoVisibles } = await import('./render-datos.js')

test('tiposRiesgoVisibles oculta los tipos restringidos para nuevas cotizaciones', () => {
  const rubros = [{ nombre: 'BAZAR' }, { nombre: 'CHANCHERIAS' }, { nombre: 'GRANJA EN GENERAL' }]

  assert.deepEqual(tiposRiesgoVisibles(rubros, ''), [{ nombre: 'BAZAR' }])
})

test('tiposRiesgoVisibles conserva el tipo restringido de una cotización histórica', () => {
  const rubros = [{ nombre: 'BAZAR' }, { nombre: 'CHANCHERIAS' }]

  assert.deepEqual(tiposRiesgoVisibles(rubros, 'CHANCHERIAS'), rubros)
  assert.deepEqual(tiposRiesgoVisibles([{ nombre: 'BAZAR' }], 'GRANJA EN GENERAL'), [
    { nombre: 'BAZAR' },
    { nombre: 'GRANJA EN GENERAL' },
  ])
})
