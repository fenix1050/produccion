import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROL_CUSTOM = { id: 5, nombre: 'Jefe de Riesgo', es_sistema: false };
const ROL_SISTEMA = { id: 1, nombre: 'admin', es_sistema: true };

function mockearRepositorio(t, { rol = ROL_CUSTOM } = {}) {
  t.mock.module('../../repositories/roles.repository.js', {
    exports: {
      findById: async () => rol,
      crear: async (datos) => ({ id: 30, es_sistema: false, ...datos }),
      actualizar: async (id, cambios) => ({ ...rol, ...cambios }),
    },
  });
}

// Cache-busting con query string: mismo motivo que usuarios.service.test.js — cada test
// necesita que roles.service.js se reevalúe contra el mock de ESE test.

test('crearRol rechaza con 403 si un solicitante sin puede_editar_planes intenta otorgar ese permiso', async (t) => {
  mockearRepositorio(t);
  const { crearRol } = await import('./roles.service.js?case=crear-escalada-planes');

  const solicitante = { id: 9, rol: 'agente', puede_gestionar_usuarios: true, puede_editar_planes: false };

  await assert.rejects(
    () =>
      crearRol(
        {
          nombre: 'Rol nuevo',
          puede_editar_tasas: false,
          puede_gestionar_usuarios: false,
          puede_editar_coberturas: false,
          puede_editar_planes: true,
        },
        solicitante
      ),
    (err) => {
      assert.equal(err.status, 403);
      return true;
    }
  );
});

test('crearRol rechaza con 403 si un solicitante intenta otorgarse puede_gestionar_usuarios sin tenerlo', async (t) => {
  mockearRepositorio(t);
  const { crearRol } = await import('./roles.service.js?case=crear-escalada-gestion-usuarios');

  const solicitante = { id: 9, rol: 'agente', puede_gestionar_usuarios: false, puede_editar_planes: true };

  await assert.rejects(
    () =>
      crearRol(
        {
          nombre: 'Rol nuevo',
          puede_editar_tasas: false,
          puede_gestionar_usuarios: true,
          puede_editar_coberturas: false,
          puede_editar_planes: false,
        },
        solicitante
      ),
    (err) => {
      assert.equal(err.status, 403);
      return true;
    }
  );
});

test('crearRol permite otorgar únicamente permisos que el solicitante ya tiene', async (t) => {
  mockearRepositorio(t);
  const { crearRol } = await import('./roles.service.js?case=crear-permitido-subset');

  const solicitante = { id: 9, rol: 'agente', puede_gestionar_usuarios: true, puede_editar_planes: false };

  const resultado = await crearRol(
    {
      nombre: 'Rol nuevo',
      puede_editar_tasas: false,
      puede_gestionar_usuarios: true,
      puede_editar_coberturas: false,
      puede_editar_planes: false,
    },
    solicitante
  );
  assert.equal(resultado.puede_gestionar_usuarios, true);
});

test('crearRol permite a un admin pleno otorgar los 4 permisos sin restricción', async (t) => {
  mockearRepositorio(t);
  const { crearRol } = await import('./roles.service.js?case=crear-admin-sin-restriccion');

  const solicitanteAdmin = { id: 1, rol: 'admin' };
  const resultado = await crearRol(
    {
      nombre: 'Rol nuevo',
      puede_editar_tasas: true,
      puede_gestionar_usuarios: true,
      puede_editar_coberturas: true,
      puede_editar_planes: true,
    },
    solicitanteAdmin
  );
  assert.equal(resultado.puede_gestionar_usuarios, true);
});

test('editarRol rechaza con 403 si un solicitante intenta otorgar un permiso que no tiene, aunque el rol no sea de sistema', async (t) => {
  mockearRepositorio(t);
  const { editarRol } = await import('./roles.service.js?case=editar-escalada');

  const solicitante = { id: 9, rol: 'agente', puede_gestionar_usuarios: true, puede_editar_coberturas: false };

  await assert.rejects(
    () => editarRol(ROL_CUSTOM.id, { puede_editar_coberturas: true }, solicitante),
    (err) => {
      assert.equal(err.status, 403);
      return true;
    }
  );
});

test('editarRol sigue rechazando con 409 la edición de un rol de sistema, antes de chequear permisos', async (t) => {
  mockearRepositorio(t, { rol: ROL_SISTEMA });
  const { editarRol } = await import('./roles.service.js?case=editar-sistema-409');

  const solicitanteAdmin = { id: 1, rol: 'admin' };
  await assert.rejects(
    () => editarRol(ROL_SISTEMA.id, { puede_editar_coberturas: true }, solicitanteAdmin),
    (err) => {
      assert.equal(err.status, 409);
      return true;
    }
  );
});
