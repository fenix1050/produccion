import assert from 'node:assert/strict'
import { test } from 'node:test'

// QA adversarial 2026-10-01: un `\u0000` en cualquier string del body JSON llegaba a Postgres
// (`22P05`, "unsupported Unicode escape sequence") y respondía 500. Debe ser un 400 en el borde.

function correr(rechazarBytesNulos, body) {
  let error
  let nextLlamado = false
  rechazarBytesNulos({ body }, {}, (err) => {
    if (err) error = err
    else nextLlamado = true
  })
  return { error, nextLlamado }
}

test('string con byte nulo en la raíz responde 400', async () => {
  const { rechazarBytesNulos } = await import('./null-bytes.js')
  const { error, nextLlamado } = correr(rechazarBytesNulos, { cliente_nombre: 'Ana\u0000' })
  assert.equal(error?.status, 400)
  assert.match(error.publicMessage, /byte nulo/i)
  assert.equal(nextLlamado, false)
})

test('byte nulo anidado en objetos y arrays responde 400', async () => {
  const { rechazarBytesNulos } = await import('./null-bytes.js?case=anidado')
  const body = { riesgo_datos: { items: [{ a: 1 }, { b: ['ok', 'mal\u0000'] }] } }
  assert.equal(correr(rechazarBytesNulos, body).error?.status, 400)
})

test('byte nulo en una CLAVE del objeto también se rechaza', async () => {
  const { rechazarBytesNulos } = await import('./null-bytes.js?case=clave')
  assert.equal(correr(rechazarBytesNulos, { ['a\u0000b']: 1 }).error?.status, 400)
})

test('body sin bytes nulos pasa (incluye números, null, booleanos y strings vacíos)', async () => {
  const { rechazarBytesNulos } = await import('./null-bytes.js?case=ok')
  const body = { a: 'hola', b: 1, c: null, d: true, e: '', f: [1, 'dos', { g: 'ñandú' }] }
  const { error, nextLlamado } = correr(rechazarBytesNulos, body)
  assert.equal(error, undefined)
  assert.equal(nextLlamado, true)
})

test('body ausente, null o primitivo pasa sin explotar', async () => {
  const { rechazarBytesNulos } = await import('./null-bytes.js?case=primitivos')
  for (const body of [undefined, null, 'texto', 5, {}]) {
    assert.equal(correr(rechazarBytesNulos, body).nextLlamado, true)
  }
})

test('anidamiento muy profundo no desborda la pila', async () => {
  const { rechazarBytesNulos } = await import('./null-bytes.js?case=profundo')
  let body = { fin: 'mal\u0000' }
  for (let i = 0; i < 50_000; i += 1) body = { hijo: body }
  assert.equal(correr(rechazarBytesNulos, body).error?.status, 400)
})
