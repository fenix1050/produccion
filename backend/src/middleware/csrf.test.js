import assert from 'node:assert/strict'
import { test } from 'node:test'

// RED: csrf.js todavía no existe. Double-submit: la cookie CSRF (legible por JS) y el
// header X-CSRF-Token deben coincidir en cada método mutante. GET/HEAD/OPTIONS no
// requieren el header. POST /api/auth/login queda exento (todavía no existe cookie CSRF
// en esa request — el login la crea).

function crearReq({ method = 'POST', path = '/otra-ruta', cookieCsrf, header } = {}) {
  return {
    method,
    path,
    cookies: cookieCsrf === undefined ? {} : { tajy_csrf: cookieCsrf },
    headers: header === undefined ? {} : { 'x-csrf-token': header },
  }
}

function correr(csrfProtection, req) {
  let error
  let nextLlamado = false
  csrfProtection(req, {}, (err) => {
    if (err) error = err
    else nextLlamado = true
  })
  return { error, nextLlamado }
}

test('GET pasa sin exigir el header CSRF', async () => {
  const { csrfProtection } = await import('./csrf.js')
  const req = crearReq({ method: 'GET' })
  const { error, nextLlamado } = correr(csrfProtection, req)
  assert.equal(error, undefined)
  assert.equal(nextLlamado, true)
})

test('HEAD pasa sin exigir el header CSRF', async () => {
  const { csrfProtection } = await import('./csrf.js?case=head')
  const req = crearReq({ method: 'HEAD' })
  const { error, nextLlamado } = correr(csrfProtection, req)
  assert.equal(error, undefined)
  assert.equal(nextLlamado, true)
})

test('POST sin header X-CSRF-Token responde 403', async () => {
  const { csrfProtection } = await import('./csrf.js?case=post-sin-header')
  const req = crearReq({ method: 'POST', cookieCsrf: 'valor-a' })
  const { error } = correr(csrfProtection, req)
  assert.equal(error?.status, 403)
})

test('POST con header distinto de la cookie responde 403', async () => {
  const { csrfProtection } = await import('./csrf.js?case=post-header-distinto')
  const req = crearReq({ method: 'POST', cookieCsrf: 'valor-a', header: 'valor-b' })
  const { error } = correr(csrfProtection, req)
  assert.equal(error?.status, 403)
})

test('POST con header igual a la cookie pasa (next sin error)', async () => {
  const { csrfProtection } = await import('./csrf.js?case=post-header-igual')
  const req = crearReq({ method: 'POST', cookieCsrf: 'valor-a', header: 'valor-a' })
  const { error, nextLlamado } = correr(csrfProtection, req)
  assert.equal(error, undefined)
  assert.equal(nextLlamado, true)
})

test('PUT/PATCH/DELETE también exigen el header (mismo criterio que POST)', async () => {
  const { csrfProtection } = await import('./csrf.js?case=otros-metodos-mutantes')
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    const sinHeader = correr(csrfProtection, crearReq({ method, cookieCsrf: 'valor-a' }))
    assert.equal(sinHeader.error?.status, 403, `${method} sin header debe responder 403`)

    const conHeader = correr(
      csrfProtection,
      crearReq({ method, cookieCsrf: 'valor-a', header: 'valor-a' })
    )
    assert.equal(conHeader.nextLlamado, true, `${method} con header correcto debe pasar`)
  }
})

test('POST /auth/login está exento (todavía no existe cookie CSRF en esa request)', async () => {
  const { csrfProtection } = await import('./csrf.js?case=login-exento')
  const req = crearReq({ method: 'POST', path: '/auth/login' })
  const { error, nextLlamado } = correr(csrfProtection, req)
  assert.equal(error, undefined)
  assert.equal(nextLlamado, true)
})
