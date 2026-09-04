import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const migrationUrl = new URL('./072_revoke_pf3_rpc_browser_roles.sql', import.meta.url)

const PF3_FUNCTION_SIGNATURES = [
  'public.publicar_texto_propuesta(TEXT, TEXT, TEXT, TEXT, INT)',
  'public.iniciar_emision_propuesta_formal(BIGINT, INT, JSONB, TEXT, TEXT, TEXT, JSONB, INT, BOOLEAN)',
  'public.actualizar_snapshot_emision_propuesta_formal(BIGINT, JSONB, TEXT)',
  'public.confirmar_emision_propuesta_formal(BIGINT, TEXT, TEXT, INT, INT)',
  'public.registrar_error_emision_propuesta_formal(BIGINT, TEXT, INT)',
  'public.anular_propuesta_formal(BIGINT, TEXT, INT, BOOLEAN)',
]

test('migration 072 removes PF-3 RPC execution from browser roles while preserving service role access', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  for (const signature of PF3_FUNCTION_SIGNATURES) {
    assert.ok(sql.includes(`REVOKE EXECUTE ON FUNCTION ${signature} FROM anon;`))
    assert.ok(sql.includes(`REVOKE EXECUTE ON FUNCTION ${signature} FROM authenticated;`))
    assert.ok(sql.includes(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role;`))
  }
})
