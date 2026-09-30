import assert from 'node:assert/strict'
import { test } from 'node:test'

// Double-submit requires the versioned HttpOnly CSRF cookie and X-CSRF-Token to match
// on every mutating method. GET/HEAD/OPTIONS do not require the header. POST
// /api/auth/login remains exempt because that request creates the CSRF cookie.

function crearReq({ method = 'POST', path = '/otra-ruta', cookieCsrf, header } = {}) {
  return {
    method,
    path,
    cookies: cookieCsrf === undefined ? {} : { tajy_csrf_v2: cookieCsrf },
    headers: header === undefined ? {} : { 'x-csrf-token': header },
  }
}

function correr(csrfProtection, req) {
  let error
  let nextLlamado = false
  const clearCalls = []
  const res = { clearCookie: (name, options) => clearCalls.push({ name, options }) }
  csrfProtection(req, res, (err) => {
    if (err) error = err
    else nextLlamado = true
  })
  return { error, nextLlamado, clearCalls }
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

test('POST con header igual a la cookie versionada pasa (next sin error)', async () => {
  const { csrfProtection } = await import('./csrf.js?case=post-header-igual')
  const req = crearReq({ method: 'POST', cookieCsrf: 'valor-a', header: 'valor-a' })
  const { error, nextLlamado } = correr(csrfProtection, req)
  assert.equal(error, undefined)
  assert.equal(nextLlamado, true)
})

test('POST con valores iguales solo en la cookie legacy también responde 403', async () => {
  const { csrfProtection } = await import('./csrf.js?case=legacy-csrf-rejected')
  const req = {
    method: 'POST',
    path: '/otra-ruta',
    cookies: { tajy_session: 'jwt-viejo', tajy_csrf: 'legacy-token' },
    headers: { 'x-csrf-token': 'legacy-token' },
  }
  const { error, clearCalls } = correr(csrfProtection, req)
  assert.equal(error?.status, 403)
  assert.deepEqual(clearCalls.map(({ name }) => name).sort(), ['tajy_csrf', 'tajy_session'])
  assert.ok(clearCalls.every(({ options }) => options.domain === '.cotizador.lat'))
})

test('GET legacy cookie still clears the old domain cookie before passing through', async () => {
  const { csrfProtection } = await import('./csrf.js?case=legacy-clear-on-read')
  const req = {
    method: 'GET',
    path: '/auth/me',
    cookies: { tajy_session: 'jwt-viejo' },
    headers: {},
  }
  const { clearCalls, nextLlamado } = correr(csrfProtection, req)
  assert.equal(nextLlamado, true)
  assert.equal(clearCalls.length, 1)
  assert.equal(clearCalls[0].name, 'tajy_session')
  assert.equal(clearCalls[0].options.domain, '.cotizador.lat')
  assert.equal(clearCalls[0].options.path, '/')
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
