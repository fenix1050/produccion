import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const migrationUrl = new URL('./081_permitir_editar_borrador_error_pdf.sql', import.meta.url)

test('migration 081 lets an error_pdf draft be edited, same as a plain borrador', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION actualizar_propuesta_borrador'))

  assert.match(
    fn,
    /IF v_propuesta\.estado NOT IN \('borrador', 'error_pdf'\) THEN RAISE EXCEPTION 'PF_BORRADOR_NO_EDITABLE'/
  )
  assert.doesNotMatch(fn, /IF v_propuesta\.estado <> 'borrador' THEN/)
})

test('migration 081 keeps every other guard from 069 unchanged', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const fn = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION actualizar_propuesta_borrador'))

  assert.match(fn, /RAISE EXCEPTION 'PF_BORRADOR_NO_ENCONTRADO'/)
  assert.match(
    fn,
    /IN \('CARTA_NO_ENCONTRADA', 'COTIZACION_NO_ENCONTRADA', 'CARTA_SIN_PERMISO', 'PRODUCTO_NO_HABILITADO'\)/
  )
  assert.match(fn, /RAISE EXCEPTION 'PF_REVISION_CONFLICT'/)
  assert.match(fn, /RAISE EXCEPTION 'PF_DRAFT_INVALIDO'/)
  assert.match(fn, /RAISE EXCEPTION 'PF_SELECCION_INVALIDA'/)
  assert.match(fn, /revision = propuestas_formales\.revision \+ 1/)
})
