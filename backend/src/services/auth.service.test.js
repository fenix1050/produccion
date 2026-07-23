import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// requireAuth y jwt.sign necesitan JWT_SECRET — normalmente lo carga config/supabase.js
// vía dotenv, pero estos tests mockean el repository y nunca importan ese módulo, así que
// se setea acá para no depender de que .env esté presente en el entorno que corre los tests.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-para-auth-service-test';

const PASSWORD_ACTUAL = 'ClaveVieja123!';

function crearUsuarioMock(overrides = {}) {
  return {
    id: 7,
    nombre: 'Test',
    email: 'test@tajy.com',
    rol: 'agente',
    activo: true,
    // Rounds bajos acá: es solo el hash de setup del mock, no lo que se mide.
    password_hash: bcrypt.hashSync(PASSWORD_ACTUAL, 4),
    ultima_sesion: null,
    descuento_maximo_pct: null,
    recargo_maximo_pct: null,
    token_version: 0,
    puede_editar_tasas: false,
    puede_gestionar_usuarios: false,
    puede_editar_coberturas: false,
    puede_editar_planes: false,
    ...overrides,
  };
}

// Mock con estado mutable compartido: findById siempre lee el objeto `usuario` actual
// (no una copia tomada al momento del mock), así que incrementarTokenVersion/
// actualizarPassword hechos por un módulo (auth.service.js) se reflejan al instante en lo
// que ve otro módulo (middleware/auth.js) importado en el mismo test — mismo patrón que
// usuarios.service.test.js pero con estado en vez de solo funciones fijas.
function mockearRepositorio(t, usuario) {
  t.mock.module('../repositories/usuarios.repository.js', {
    exports: {
      findByEmail: async () => usuario,
      findById: async (id) => (String(id) === String(usuario.id) ? usuario : null),
      actualizarUltimaSesion: async () => {},
      actualizarPassword: async (_id, password_hash) => {
        usuario.password_hash = password_hash;
      },
      incrementarTokenVersion: async () => {
        usuario.token_version += 1;
      },
    },
  });
}

async function correrRequireAuth(requireAuth, token) {
  const req = { headers: { authorization: `Bearer ${token}` } };
  let error;
  await requireAuth(req, {}, (err) => {
    error = err;
  });
  return { req, error };
}

function firmarToken(usuario, tokenVersion = usuario.token_version) {
  return jwt.sign({ sub: usuario.id, rol: usuario.rol, token_version: tokenVersion }, process.env.JWT_SECRET, {
    expiresIn: '45m',
  });
}

// Cache-busting con query string (mismo motivo que usuarios.service.test.js): cada test
// necesita que middleware/auth.js y auth.service.js se reevalúen contra el mock de ESE
// test, no contra el módulo ya cacheado de un test anterior.

test('requireAuth rechaza con 401 un token firmado con token_version distinta a la actual en DB', async (t) => {
  const usuario = crearUsuarioMock({ token_version: 2 });
  mockearRepositorio(t, usuario);
  const { requireAuth } = await import('../middleware/auth.js?case=token-version-vieja');

  const token = firmarToken(usuario, 1); // el usuario ya está en token_version 2 en DB

  const { error } = await correrRequireAuth(requireAuth, token);
  assert.equal(error?.status, 401);
});

test('requireAuth acepta un token cuyo token_version coincide con el de la DB', async (t) => {
  const usuario = crearUsuarioMock({ token_version: 3 });
  mockearRepositorio(t, usuario);
  const { requireAuth } = await import('../middleware/auth.js?case=token-version-vigente');

  const token = firmarToken(usuario);

  const { error, req } = await correrRequireAuth(requireAuth, token);
  assert.equal(error, undefined);
  assert.equal(req.usuario.id, usuario.id);
});

test('POST /api/auth/logout invalida el token con el que se llamó', async (t) => {
  const usuario = crearUsuarioMock();
  mockearRepositorio(t, usuario);
  const { requireAuth } = await import('../middleware/auth.js?case=logout-invalida');
  const authService = await import('./auth.service.js?case=logout-invalida');

  const token = firmarToken(usuario);

  const antes = await correrRequireAuth(requireAuth, token);
  assert.equal(antes.error, undefined, 'el token debe ser válido antes del logout');

  await authService.logout(usuario.id);

  const despues = await correrRequireAuth(requireAuth, token);
  assert.equal(despues.error?.status, 401, 'el mismo token debe quedar inválido después del logout');
});

// --- Logging de seguridad (A09) ---

test('login loguea login_fallido con console.warn cuando la contraseña es incorrecta, sin exponer password/hash', async (t) => {
  const usuario = crearUsuarioMock();
  mockearRepositorio(t, usuario);
  const { login } = await import('./auth.service.js?case=log-login-fallido');

  const warnSpy = t.mock.method(console, 'warn', () => {});

  await assert.rejects(() => login(usuario.email, 'password-incorrecta'));

  assert.equal(warnSpy.mock.calls.length, 1);
  const [linea] = warnSpy.mock.calls[0].arguments;
  assert.match(linea, /login_fallido/);
  assert.doesNotMatch(linea, new RegExp(usuario.password_hash));
  assert.doesNotMatch(linea, /password-incorrecta/);
});

test('login loguea login_exitoso con console.warn cuando las credenciales son correctas', async (t) => {
  const usuario = crearUsuarioMock();
  mockearRepositorio(t, usuario);
  const { login } = await import('./auth.service.js?case=log-login-exitoso');

  const warnSpy = t.mock.method(console, 'warn', () => {});

  await login(usuario.email, PASSWORD_ACTUAL);

  assert.equal(warnSpy.mock.calls.length, 1);
  const [linea] = warnSpy.mock.calls[0].arguments;
  assert.match(linea, /login_exitoso/);
  assert.doesNotMatch(linea, new RegExp(PASSWORD_ACTUAL));
});

test('cambiarPassword invalida sesiones (tokens) emitidas antes del cambio', async (t) => {
  const usuario = crearUsuarioMock();
  mockearRepositorio(t, usuario);
  const { requireAuth } = await import('../middleware/auth.js?case=cambiar-password-invalida');
  const authService = await import('./auth.service.js?case=cambiar-password-invalida');

  const tokenViejo = firmarToken(usuario);

  await authService.cambiarPassword(usuario.id, PASSWORD_ACTUAL, 'ClaveNueva456!');

  const resultado = await correrRequireAuth(requireAuth, tokenViejo);
  assert.equal(resultado.error?.status, 401, 'un token emitido antes del cambio de contraseña debe quedar inválido');
});
