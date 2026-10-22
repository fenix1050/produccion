import assert from 'node:assert/strict'
import { test } from 'node:test'

import { validarCredenciales } from './validacion.js'

test('validarCredenciales acepta email con formato válido y contraseña no vacía', () => {
  assert.equal(validarCredenciales({ email: 'a@b.com', password: 'x' }), null)
})

test('validarCredenciales rechaza el envío totalmente vacío', () => {
  assert.equal(
    validarCredenciales({ email: '', password: '' }),
    'Ingresá tu email y tu contraseña.'
  )
})

test('validarCredenciales rechaza email vacío o solo espacios', () => {
  assert.equal(validarCredenciales({ email: '   ', password: 'x' }), 'Ingresá tu email.')
})

test('validarCredenciales rechaza contraseña vacía', () => {
  assert.equal(validarCredenciales({ email: 'a@b.com', password: '' }), 'Ingresá tu contraseña.')
})

test('validarCredenciales rechaza un email sin formato válido', () => {
  assert.equal(
    validarCredenciales({ email: 'no-es-email', password: 'x' }),
    'El email no tiene un formato válido.'
  )
})

test('validarCredenciales no recorta la contraseña: solo espacios cuenta como contraseña presente', () => {
  assert.equal(validarCredenciales({ email: 'a@b.com', password: '  ' }), null)
})
