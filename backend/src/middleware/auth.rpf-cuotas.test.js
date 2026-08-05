import assert from 'node:assert/strict'
import { test } from 'node:test'

import { requirePlanesEdit } from './auth.js'

// Cambio `rpf-variable-mrc`, Fase 3 (admin backend) — confirma el gate elegido en
// design.md Decisión 8 (Engram #391 decisión 4): PUT /admin/rpf-cuotas reutiliza
// `requirePlanesEdit` (permiso booleano delegable `puede_editar_planes`), NO
// `requireRole('admin')` — mismos roles que ya editan el escalar `tasa_rpf` hoy.
// Archivo propio de middleware puro (sin mocks de Supabase, sin exportar rutas nuevas).

test('requirePlanesEdit: usuario CON puede_editar_planes pasa al siguiente handler sin error', () => {
  const req = { usuario: { puede_editar_planes: true } }
  let errorRecibido = 'no-llamado'
  requirePlanesEdit(req, {}, (err) => {
    errorRecibido = err
  })

  assert.equal(errorRecibido, undefined)
})

test('requirePlanesEdit: usuario SIN puede_editar_planes recibe 403, no avanza', () => {
  const req = { usuario: { puede_editar_planes: false } }
  let errorRecibido
  requirePlanesEdit(req, {}, (err) => {
    errorRecibido = err
  })

  assert.ok(errorRecibido)
  assert.equal(errorRecibido.status ?? errorRecibido.statusCode, 403)
})

test('requirePlanesEdit: sin usuario en el request (no autenticado) recibe 403', () => {
  const req = {}
  let errorRecibido
  requirePlanesEdit(req, {}, (err) => {
    errorRecibido = err
  })

  assert.ok(errorRecibido)
  assert.equal(errorRecibido.status ?? errorRecibido.statusCode, 403)
})
