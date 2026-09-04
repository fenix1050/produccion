import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const migrationUrl = new URL(
  './073_prevenir_emision_duplicada_propuesta_formal_mrc.sql',
  import.meta.url
)

test('migration 073 rejects an emitted Carta and concurrent issuance before PDF rendering can start', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const start = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION iniciar_emision_propuesta_formal')
  )
  const startGuard = start.indexOf("RAISE EXCEPTION 'PF_CARTA_YA_TIENE_PROPUESTA_EMITIDA'")
  const startTransition = start.indexOf("SET estado = 'generando_pdf'")

  assert.match(start, /PERFORM pg_advisory_xact_lock\(v_propuesta\.carta_oferta_id\)/)
  assert.match(
    start,
    /WHERE carta_oferta_id = v_propuesta\.carta_oferta_id\s+AND estado = 'emitida'/
  )
  assert.match(start, /id <> v_propuesta\.id\s+AND estado = 'generando_pdf'/)
  assert.ok(startGuard >= 0)
  assert.ok(startTransition >= 0)
  assert.ok(startGuard < startTransition)
})

test('migration 073 protects confirmation with the same emitted-Carta domain conflict', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const confirm = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION confirmar_emision_propuesta_formal')
  )
  const conflict = confirm.indexOf("RAISE EXCEPTION 'PF_CARTA_YA_TIENE_PROPUESTA_EMITIDA'")
  const transition = confirm.indexOf("SET estado = 'emitida'")

  assert.match(confirm, /PERFORM pg_advisory_xact_lock\(v_propuesta\.carta_oferta_id\)/)
  assert.match(confirm, /id <> v_propuesta\.id\s+AND estado = 'emitida'/)
  assert.ok(conflict >= 0)
  assert.ok(transition >= 0)
  assert.ok(conflict < transition)
})

test('migration 073 preserves trusted backend-only RPC execution', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  for (const signature of [
    'public.iniciar_emision_propuesta_formal(BIGINT, INT, JSONB, TEXT, TEXT, TEXT, JSONB, INT, BOOLEAN)',
    'public.confirmar_emision_propuesta_formal(BIGINT, TEXT, TEXT, INT, INT)',
  ]) {
    assert.ok(sql.includes(`REVOKE EXECUTE ON FUNCTION ${signature} FROM anon;`))
    assert.ok(sql.includes(`REVOKE EXECUTE ON FUNCTION ${signature} FROM authenticated;`))
    assert.ok(sql.includes(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role;`))
  }
})
