import assert from 'node:assert/strict'
import { test } from 'node:test'

// Cambio `rpf-variable-mrc`, Fase 3 (admin backend) — confirma el gate elegido en
// design.md Decisión 8 (Engram #391 decisión 4): PUT /admin/rpf-cuotas reutiliza
// `requirePlanesEdit` (permiso booleano delegable `puede_editar_planes`), NO
// `requireRole('admin')` — mismos roles que ya editan el escalar `tasa_rpf` hoy.
//
// `auth.js` importa `usuarios.repository.js`, que importa `config/supabase.js` — sin
// mockearlo primero, un import estático explota en CI (sin backend/.env, ver
// admin.controller.rpf-cuotas.test.js). Mismo patrón: mockear + import dinámico con
// query string único por test para que cada uno cargue su propio módulo.
function mockearSupabase(t) {
  t.mock.module('../config/supabase.js', { namedExports: { supabase: {} } })
}

test('requirePlanesEdit: usuario CON puede_editar_planes pasa al siguiente handler sin error', async (t) => {
  mockearSupabase(t)
  const { requirePlanesEdit } = await import('./auth.js?case=rpf-cuotas-con-permiso')

  const req = { usuario: { puede_editar_planes: true } }
  let errorRecibido = 'no-llamado'
  requirePlanesEdit(req, {}, (err) => {
    errorRecibido = err
  })

  assert.equal(errorRecibido, undefined)
})

test('requirePlanesEdit: usuario SIN puede_editar_planes recibe 403, no avanza', async (t) => {
  mockearSupabase(t)
  const { requirePlanesEdit } = await import('./auth.js?case=rpf-cuotas-sin-permiso')

  const req = { usuario: { puede_editar_planes: false } }
  let errorRecibido
  requirePlanesEdit(req, {}, (err) => {
    errorRecibido = err
  })

  assert.ok(errorRecibido)
  assert.equal(errorRecibido.status ?? errorRecibido.statusCode, 403)
})

test('requirePlanesEdit: sin usuario en el request (no autenticado) recibe 403', async (t) => {
  mockearSupabase(t)
  const { requirePlanesEdit } = await import('./auth.js?case=rpf-cuotas-sin-usuario')

  const req = {}
  let errorRecibido
  requirePlanesEdit(req, {}, (err) => {
    errorRecibido = err
  })

  assert.ok(errorRecibido)
  assert.equal(errorRecibido.status ?? errorRecibido.statusCode, 403)
})
