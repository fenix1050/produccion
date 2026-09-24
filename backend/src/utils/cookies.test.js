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

test('opcionesCsrf(): httpOnly true, same maxAge as the session, and no Domain', async () => {
  const { opcionesSesion, opcionesCsrf } = await import('./cookies.js')
  const sesion = opcionesSesion()
  const csrf = opcionesCsrf()
  assert.equal(csrf.httpOnly, true)
  assert.equal(csrf.maxAge, sesion.maxAge)
  assert.equal(csrf.domain, undefined)
  assert.equal(sesion.domain, undefined)
})

test('COOKIE_DOMAIN cannot widen either cookie beyond its host', async (t) => {
  const dominioAnterior = process.env.COOKIE_DOMAIN
  process.env.COOKIE_DOMAIN = '.example.invalid'
  t.after(() => {
    if (dominioAnterior === undefined) delete process.env.COOKIE_DOMAIN
    else process.env.COOKIE_DOMAIN = dominioAnterior
  })
  const { opcionesSesion, opcionesCsrf } = await import('./cookies.js?case=host-only')
  assert.equal(opcionesSesion().domain, undefined)
  assert.equal(opcionesCsrf().domain, undefined)
  assert.equal(opcionesSesion().secure, true)
  assert.equal(opcionesCsrf().secure, true)
})

test('setCookiesSesion(): setea ambas cookies HttpOnly y host-only con res.cookie', async () => {
  const { setCookiesSesion, COOKIE_SESION, COOKIE_CSRF } = await import('./cookies.js')
  const llamadas = []
  const res = { cookie: (nombre, valor, opciones) => llamadas.push({ nombre, valor, opciones }) }

  setCookiesSesion(res, 'jwt-de-prueba', 'csrf-de-prueba')

  assert.equal(llamadas.length, 2)
  const sesion = llamadas.find((c) => c.nombre === COOKIE_SESION)
  const csrf = llamadas.find((c) => c.nombre === COOKIE_CSRF)
  assert.equal(sesion.valor, 'jwt-de-prueba')
  assert.equal(sesion.opciones.httpOnly, true)
  assert.equal(sesion.opciones.domain, undefined)
  assert.equal(csrf.valor, 'csrf-de-prueba')
  assert.equal(csrf.opciones.httpOnly, true)
  assert.equal(csrf.opciones.domain, undefined)
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
  // Mismos atributos relevantes que en el set (httpOnly, secure, sameSite, path),
  // sin Domain ni maxAge — res.clearCookie conserva la identidad host-only.
  const { maxAge: _ignorada1, ...baseSesion } = opcionesSesion()
  const { maxAge: _ignorada2, ...baseCsrf } = opcionesCsrf()
  assert.deepEqual(sesion.opciones, baseSesion)
  assert.deepEqual(csrf.opciones, baseCsrf)
})

test('versiona los nombres nuevos y conserva los nombres configurados como legacy', async () => {
  const cookies = await import('./cookies.js?case=versioned-cookie-names')
  assert.equal(cookies.COOKIE_SESION, 'tajy_session_v2')
  assert.equal(cookies.COOKIE_CSRF, 'tajy_csrf_v2')
  assert.equal(cookies.COOKIE_SESION_LEGACY, 'tajy_session')
  assert.equal(cookies.COOKIE_CSRF_LEGACY, 'tajy_csrf')
})

test('limpiarCookiesLegadas expires only received legacy cookies at the shared parent domain', async () => {
  const { limpiarCookiesLegadas, COOKIE_SESION_LEGACY, COOKIE_CSRF_LEGACY } =
    await import('./cookies.js?case=expire-legacy')
  const llamadas = []
  const req = {
    cookies: {
      [COOKIE_SESION_LEGACY]: 'jwt-viejo',
      [COOKIE_CSRF_LEGACY]: 'csrf-viejo',
    },
  }
  const res = { clearCookie: (nombre, opciones) => llamadas.push({ nombre, opciones }) }

  limpiarCookiesLegadas(req, res)

  assert.deepEqual(
    llamadas.map(({ nombre }) => nombre).sort(),
    [COOKIE_CSRF_LEGACY, COOKIE_SESION_LEGACY].sort()
  )
  assert.ok(llamadas.every(({ opciones }) => opciones.domain === '.cotizador.lat'))
  assert.ok(llamadas.every(({ opciones }) => opciones.path === '/'))
})

test('no expires legacy cookies that were not sent by the request', async () => {
  const { limpiarCookiesLegadas } = await import('./cookies.js?case=no-legacy-to-expire')
  const llamadas = []
  limpiarCookiesLegadas({ cookies: {} }, { clearCookie: (...args) => llamadas.push(args) })
  assert.equal(llamadas.length, 0)
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

  const { COOKIE_SESION, COOKIE_CSRF, COOKIE_SESION_LEGACY, COOKIE_CSRF_LEGACY } =
    await import('./cookies.js?case=custom-cookie-names')

  assert.equal(COOKIE_SESION, 'tajy_test_session_v2')
  assert.equal(COOKIE_CSRF, 'tajy_test_csrf_v2')
  assert.equal(COOKIE_SESION_LEGACY, 'tajy_test_session')
  assert.equal(COOKIE_CSRF_LEGACY, 'tajy_test_csrf')
})
