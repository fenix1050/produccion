import assert from 'node:assert/strict'
import http from 'node:http'
import { after, before, describe, test } from 'node:test'

// Pruebas HTTP reales sobre createApp() (sin tocar la DB: todas las rutas usadas responden
// antes de llegar a un repository). Cubren el QA adversarial 2026-10-01: body demasiado
// grande, JSON inválido y body que no es un objeto.

process.env.FRONTEND_URL = 'https://app.example.test'
process.env.JWT_SECRET ||= 'secreto-de-prueba'
process.env.SUPABASE_URL ||= 'http://localhost:54321'
process.env.SUPABASE_SERVICE_KEY ||= 'clave-de-prueba'

let servidor
let puerto

before(async () => {
  const { createApp } = await import('./app.js?case=http')
  servidor = createApp().listen(0, '127.0.0.1')
  await new Promise((resolve) => servidor.once('listening', resolve))
  puerto = servidor.address().port
})

after(async () => {
  await new Promise((resolve) => servidor.close(resolve))
})

function pedir({ method = 'POST', path = '/api/auth/login', headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: puerto, method, path, headers }, (res) => {
      const trozos = []
      res.on('data', (t) => trozos.push(t))
      res.on('end', () => {
        const texto = Buffer.concat(trozos).toString('utf8')
        let json
        try {
          json = JSON.parse(texto)
        } catch {
          json = undefined
        }
        resolve({ status: res.statusCode, headers: res.headers, json, texto })
      })
    })
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

describe('errores del parser de body', () => {
  test('body mayor al límite responde 413 con mensaje en español', async () => {
    const grande = JSON.stringify({ x: 'a'.repeat(3 * 1024 * 1024) })
    const res = await pedir({ headers: JSON_HEADERS, body: grande })
    assert.equal(res.status, 413)
    assert.deepEqual(res.json, { error: 'El cuerpo de la solicitud es demasiado grande' })
  })

  test('JSON inválido responde 400 "JSON inválido"', async () => {
    const res = await pedir({ headers: JSON_HEADERS, body: '{"a":' })
    assert.equal(res.status, 400)
    assert.deepEqual(res.json, { error: 'JSON inválido' })
  })

  test('body `null` responde 400 con mensaje en español', async () => {
    const res = await pedir({ headers: JSON_HEADERS, body: 'null' })
    assert.equal(res.status, 400)
    assert.notEqual(res.json.error, 'Error interno del servidor')
  })

  test('byte nulo en un string del body responde 400 (no llega a la DB)', async () => {
    const res = await pedir({
      headers: JSON_HEADERS,
      body: JSON.stringify({ email: 'a@b.com\u0000', password: 'x' }),
    })
    assert.equal(res.status, 400)
    assert.match(res.json.error, /byte nulo/)
  })

  test('body string JSON responde 400 con mensaje en español', async () => {
    const res = await pedir({ headers: JSON_HEADERS, body: '"hola"' })
    assert.equal(res.status, 400)
    assert.notEqual(res.json.error, 'Error interno del servidor')
  })
})
