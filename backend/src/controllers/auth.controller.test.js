import assert from 'node:assert/strict'
import { test } from 'node:test'

// Cambio session-httponly-cookie: login setea 2 cookies (sesión httpOnly + CSRF) y ya no
// expone el JWT en el body; logout y cambio de contraseña limpian ambas cookies.

function crearResFake() {
  const res = { statusCode: 200, body: undefined, cookiesSeteadas: [], cookiesLimpiadas: [] }
  res.status = (codigo) => {
    res.statusCode = codigo
    return res
  }
  res.json = (payload) => {
    res.body = payload
    return res
  }
  res.end = () => res
  res.cookie = (nombre, valor, opciones) => {
    res.cookiesSeteadas.push({ nombre, valor, opciones })
    return res
  }
  res.clearCookie = (nombre, opciones) => {
    res.cookiesLimpiadas.push({ nombre, opciones })
    return res
  }
  return res
}

test('login: setea 2 cookies (sesión + csrf) y el body NO incluye el JWT', async (t) => {
  t.mock.module('../services/auth.service.js', {
    namedExports: {
      login: async () => ({
        token: 'jwt-de-prueba',
        csrfToken: 'csrf-de-prueba',
        usuario: { id: 1, rol: 'agente' },
      }),
    },
  })
  const { login } = await import('./auth.controller.js?case=login-setea-cookies')

  const req = { body: { email: 'test@tajy.com', password: 'ClaveVieja123!' } }
  const res = crearResFake()
  await login(req, res, () => {})

  assert.equal(res.cookiesSeteadas.length, 2)
  assert.equal(res.body.usuario.id, 1)
  assert.equal(res.body.token, undefined, 'el body no debe exponer el JWT')
  assert.equal(res.body.csrfToken, undefined, 'el csrfToken viaja por cookie, no por body')
})

test('logout: limpia ambas cookies (sesión + csrf)', async (t) => {
  t.mock.module('../services/auth.service.js', {
    namedExports: { logout: async () => {} },
  })
  const { logout } = await import('./auth.controller.js?case=logout-limpia-cookies')

  const req = { usuario: { id: 1 } }
  const res = crearResFake()
  await logout(req, res, () => {})

  assert.equal(res.cookiesLimpiadas.length, 2)
})

test('cambiarPassword: limpia ambas cookies tras invalidar la sesión (token_version)', async (t) => {
  t.mock.module('../services/auth.service.js', {
    namedExports: { cambiarPassword: async () => {} },
  })
  const { cambiarPassword } = await import('./auth.controller.js?case=cambiar-password-limpia-cookies')

  const req = {
    usuario: { id: 1 },
    body: { password_actual: 'ClaveVieja123!', password_nueva: 'ClaveNueva456!' },
  }
  const res = crearResFake()
  await cambiarPassword(req, res, () => {})

  assert.equal(res.cookiesLimpiadas.length, 2)
})

test('me: devuelve req.usuario completo, incluyendo ultima_sesion', async (t) => {
  // auth.controller.js importa auth.service.js -> usuariosRepository -> config/supabase.js
  // (exige SUPABASE_URL/SUPABASE_SERVICE_KEY reales) — se mockea aunque `me` no la invoque,
  // mismo motivo que el resto de los tests de este archivo.
  t.mock.module('../services/auth.service.js', { namedExports: {} })
  const { me } = await import('./auth.controller.js?case=me-devuelve-usuario')

  const req = { usuario: { id: 1, rol: 'agente', ultima_sesion: '2026-08-01T10:00:00Z' } }
  const res = crearResFake()
  await me(req, res, () => {})

  assert.equal(res.body.usuario.ultima_sesion, '2026-08-01T10:00:00Z')
})
