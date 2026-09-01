import assert from 'node:assert/strict'
import { test } from 'node:test'

// RED: cookies.js todavía no existe — define el contrato antes de implementarlo (D2 de
// design.md: única fuente de atributos de cookie, para que set/clear nunca diverjan).

test('opcionesSesion(): httpOnly true, maxAge de 45 minutos', async () => {
  const { opcionesSesion } = await import('./cookies.js')
  const opciones = opcionesSesion()
  assert.equal(opciones.httpOnly, true)
  assert.equal(opciones.maxAge, 45 * 60 * 1000)
})

test('opcionesCsrf(): httpOnly false (legible por document.cookie), mismo maxAge que la sesión', async () => {
  const { opcionesSesion, opcionesCsrf } = await import('./cookies.js')
  const sesion = opcionesSesion()
  const csrf = opcionesCsrf()
  assert.equal(csrf.httpOnly, false)
  assert.equal(csrf.maxAge, sesion.maxAge)
})

test('en producción (NODE_ENV=production): secure true y domain .cotizador.lat', async (t) => {
  const anterior = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  t.after(() => {
    process.env.NODE_ENV = anterior
  })
  const { opcionesSesion, opcionesCsrf } = await import('./cookies.js?case=prod')
  const sesion = opcionesSesion()
  const csrf = opcionesCsrf()
  assert.equal(sesion.secure, true)
  assert.equal(sesion.domain, '.cotizador.lat')
  assert.equal(csrf.secure, true)
  assert.equal(csrf.domain, '.cotizador.lat')
})

test('fuera de producción (dev/test): secure false y sin domain (para que funcione en localhost)', async (t) => {
  const anterior = process.env.NODE_ENV
  process.env.NODE_ENV = 'test'
  t.after(() => {
    process.env.NODE_ENV = anterior
  })
  const { opcionesSesion, opcionesCsrf } = await import('./cookies.js?case=dev')
  const sesion = opcionesSesion()
  const csrf = opcionesCsrf()
  assert.equal(sesion.secure, false)
  assert.equal(sesion.domain, undefined)
  assert.equal(csrf.secure, false)
  assert.equal(csrf.domain, undefined)
})

test('setCookiesSesion(): setea COOKIE_SESION (httpOnly) y COOKIE_CSRF (no httpOnly) con res.cookie', async () => {
  const { setCookiesSesion, COOKIE_SESION, COOKIE_CSRF } = await import('./cookies.js')
  const llamadas = []
  const res = { cookie: (nombre, valor, opciones) => llamadas.push({ nombre, valor, opciones }) }

  setCookiesSesion(res, 'jwt-de-prueba', 'csrf-de-prueba')

  assert.equal(llamadas.length, 2)
  const sesion = llamadas.find((c) => c.nombre === COOKIE_SESION)
  const csrf = llamadas.find((c) => c.nombre === COOKIE_CSRF)
  assert.equal(sesion.valor, 'jwt-de-prueba')
  assert.equal(sesion.opciones.httpOnly, true)
  assert.equal(csrf.valor, 'csrf-de-prueba')
  assert.equal(csrf.opciones.httpOnly, false)
})

test('limpiarCookiesSesion(): limpia ambas cookies con los MISMOS atributos base (sin maxAge) — evita cookie zombie', async () => {
  const { limpiarCookiesSesion, opcionesSesion, opcionesCsrf, COOKIE_SESION, COOKIE_CSRF } =
    await import('./cookies.js')
  const llamadas = []
  const res = { clearCookie: (nombre, opciones) => llamadas.push({ nombre, opciones }) }

  limpiarCookiesSesion(res)

  assert.equal(llamadas.length, 2)
  const sesion = llamadas.find((c) => c.nombre === COOKIE_SESION)
  const csrf = llamadas.find((c) => c.nombre === COOKIE_CSRF)
  assert.ok(sesion, 'debe limpiar la cookie de sesión')
  assert.ok(csrf, 'debe limpiar la cookie CSRF')
  // Mismos atributos relevantes que en el set (httpOnly, secure, sameSite, domain, path),
  // sin maxAge — res.clearCookie solo borra si domain/path/sameSite/secure coinciden.
  const { maxAge: _ignorada1, ...baseSesion } = opcionesSesion()
  const { maxAge: _ignorada2, ...baseCsrf } = opcionesCsrf()
  assert.deepEqual(sesion.opciones, baseSesion)
  assert.deepEqual(csrf.opciones, baseCsrf)
})

test('permite nombres de cookies distintos por entorno mediante variables de entorno', async (t) => {
  const sessionAnterior = process.env.COOKIE_SESSION_NAME
  const csrfAnterior = process.env.COOKIE_CSRF_NAME

  process.env.COOKIE_SESSION_NAME = 'tajy_test_session'
  process.env.COOKIE_CSRF_NAME = 'tajy_test_csrf'

  t.after(() => {
    if (sessionAnterior === undefined) delete process.env.COOKIE_SESSION_NAME
    else process.env.COOKIE_SESSION_NAME = sessionAnterior

    if (csrfAnterior === undefined) delete process.env.COOKIE_CSRF_NAME
    else process.env.COOKIE_CSRF_NAME = csrfAnterior
  })

  const { COOKIE_SESION, COOKIE_CSRF } = await import('./cookies.js?case=custom-cookie-names')

  assert.equal(COOKIE_SESION, 'tajy_test_session')
  assert.equal(COOKIE_CSRF, 'tajy_test_csrf')
})
