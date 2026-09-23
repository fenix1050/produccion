import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const migrationUrl = new URL('./080_ineligibilidad_carta_ya_emitida.sql', import.meta.url)

test('migration 080 flags a Carta with an already-emitted Propuesta Formal as ineligible', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const fn = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION motivo_ineligibilidad_carta_propuesta')
  )

  const emittedGuard = fn.indexOf("RETURN 'PF_CARTA_YA_TIENE_PROPUESTA_EMITIDA'")
  const incompleteGuard = fn.indexOf("RETURN 'CARTA_INCOMPLETA'")
  const expiredGuard = fn.indexOf("RETURN 'CARTA_VENCIDA'")

  assert.match(
    fn,
    /WHERE propuestas_formales\.carta_oferta_id = p_carta_id\s+AND propuestas_formales\.estado = 'emitida'/
  )
  assert.ok(emittedGuard >= 0)
  assert.ok(incompleteGuard >= 0)
  assert.ok(expiredGuard >= 0)
  // Must run before the other content-readiness guards, so a Carta with an emitted
  // sibling never reaches "listo para emitir" regardless of its own document state.
  assert.ok(emittedGuard < incompleteGuard)
  assert.ok(emittedGuard < expiredGuard)
})

test('migration 080 keeps the existing ownership and product guards ahead of the new check', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const fn = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION motivo_ineligibilidad_carta_propuesta')
  )

  const permisoGuard = fn.indexOf("RETURN 'CARTA_SIN_PERMISO'")
  const productoGuard = fn.indexOf("RETURN 'PRODUCTO_NO_HABILITADO'")
  const noEmitidaGuard = fn.indexOf("RETURN 'CARTA_NO_EMITIDA'")
  const emittedGuard = fn.indexOf("RETURN 'PF_CARTA_YA_TIENE_PROPUESTA_EMITIDA'")

  assert.ok(permisoGuard >= 0 && permisoGuard < emittedGuard)
  assert.ok(productoGuard >= 0 && productoGuard < emittedGuard)
  assert.ok(noEmitidaGuard >= 0 && noEmitidaGuard < emittedGuard)
})
