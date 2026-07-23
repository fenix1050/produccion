import { test } from 'node:test';
import assert from 'node:assert/strict';

const USUARIO_OBJETIVO = { id: 5, rol: 'agente', email: 'agente@tajy.com' };
const ROL_ADMIN = { id: 1, nombre: 'admin' };
const SOLICITANTE_NO_ADMIN = { id: 9, rol: 'agente', puede_gestionar_usuarios: true };

function mockearRepositorios(t, { usuario = USUARIO_OBJETIVO, rolDestino = ROL_ADMIN } = {}) {
  t.mock.module('../../repositories/usuarios.repository.js', {
    exports: {
      findById: async () => usuario,
      findByEmail: async () => null,
      actualizar: async (id, cambios) => ({ ...usuario, ...cambios }),
      crear: async (datos) => ({ id: 20, ...datos }),
    },
  });
  t.mock.module('../../repositories/roles.repository.js', {
    exports: {
      findById: async () => rolDestino,
    },
  });
}

// Cache-busting con query string: cada test necesita que usuarios.service.js se reevalúe
// desde cero para que sus imports estáticos resuelvan contra el mock de ESE test — si se
// reutiliza el mismo specifier, Node devuelve el módulo ya cacheado del test anterior.
test('editarUsuario rechaza con 403 si un solicitante no-admin intenta setear rol_id al id del rol admin', async (t) => {
  mockearRepositorios(t);
  const { editarUsuario } = await import('./usuarios.service.js?case=escalada-rol');

  await assert.rejects(
    () => editarUsuario(USUARIO_OBJETIVO.id, { rol_id: ROL_ADMIN.id }, SOLICITANTE_NO_ADMIN),
    (err) => {
      assert.equal(err.status, 403);
      return true;
    }
  );
});

test('editarUsuario permite el cambio de rol_id cuando el solicitante es admin', async (t) => {
  mockearRepositorios(t);
  const { editarUsuario } = await import('./usuarios.service.js?case=admin-permitido');

  const solicitanteAdmin = { id: 1, rol: 'admin' };
  const resultado = await editarUsuario(USUARIO_OBJETIVO.id, { rol_id: ROL_ADMIN.id }, solicitanteAdmin);
  assert.equal(resultado.rol_id, ROL_ADMIN.id);
});

test('editarUsuario no consulta roles cuando cambios no trae rol_id', async (t) => {
  mockearRepositorios(t, { rolDestino: null });
  const { editarUsuario } = await import('./usuarios.service.js?case=sin-rol-id');

  const resultado = await editarUsuario(USUARIO_OBJETIVO.id, { nombre: 'Nuevo Nombre' }, SOLICITANTE_NO_ADMIN);
  assert.equal(resultado.nombre, 'Nuevo Nombre');
});

// --- crearUsuario: mismo gap de escalada que editarUsuario, pero al dar de alta ---

test('crearUsuario rechaza con 403 si un solicitante no-admin intenta dar de alta un usuario con rol_id del rol admin', async (t) => {
  mockearRepositorios(t);
  const { crearUsuario } = await import('./usuarios.service.js?case=crear-escalada-rol');

  await assert.rejects(
    () =>
      crearUsuario(
        { nombre: 'Nuevo', email: 'nuevo@tajy.com', rol_id: ROL_ADMIN.id, password: 'password123' },
        SOLICITANTE_NO_ADMIN
      ),
    (err) => {
      assert.equal(err.status, 403);
      return true;
    }
  );
});

test('crearUsuario permite dar de alta un usuario con rol_id admin cuando el solicitante es admin', async (t) => {
  mockearRepositorios(t);
  const { crearUsuario } = await import('./usuarios.service.js?case=crear-admin-permitido');

  const solicitanteAdmin = { id: 1, rol: 'admin' };
  const resultado = await crearUsuario(
    { nombre: 'Nuevo', email: 'nuevo@tajy.com', rol_id: ROL_ADMIN.id, password: 'password123' },
    solicitanteAdmin
  );
  assert.equal(resultado.rol_id, ROL_ADMIN.id);
});

// --- editarUsuario: un solicitante no-admin no puede subirse su propio tope ---

test('editarUsuario rechaza con 403 si un solicitante no-admin intenta modificar su propio tope de descuento', async (t) => {
  const solicitante = { id: 9, rol: 'agente', puede_gestionar_usuarios: true };
  mockearRepositorios(t, { usuario: { id: 9, rol: 'agente', email: 'agente@tajy.com' } });
  const { editarUsuario } = await import('./usuarios.service.js?case=auto-tope-rechazado');

  await assert.rejects(
    () => editarUsuario(solicitante.id, { descuento_maximo_pct: 50 }, solicitante),
    (err) => {
      assert.equal(err.status, 403);
      return true;
    }
  );
});

test('editarUsuario permite que un admin modifique su propio tope de descuento', async (t) => {
  const solicitanteAdmin = { id: 1, rol: 'admin' };
  mockearRepositorios(t, { usuario: { id: 1, rol: 'admin', email: 'admin@tajy.com' } });
  const { editarUsuario } = await import('./usuarios.service.js?case=auto-tope-admin-permitido');

  const resultado = await editarUsuario(solicitanteAdmin.id, { descuento_maximo_pct: 50 }, solicitanteAdmin);
  assert.equal(resultado.descuento_maximo_pct, 50);
});

test('editarUsuario permite modificar el tope de OTRO usuario aunque el solicitante no sea admin', async (t) => {
  mockearRepositorios(t, { usuario: USUARIO_OBJETIVO });
  const { editarUsuario } = await import('./usuarios.service.js?case=tope-otro-usuario-permitido');

  const resultado = await editarUsuario(USUARIO_OBJETIVO.id, { descuento_maximo_pct: 30 }, SOLICITANTE_NO_ADMIN);
  assert.equal(resultado.descuento_maximo_pct, 30);
});
