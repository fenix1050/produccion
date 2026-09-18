import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const migrationUrl = new URL('./076_listado_propuestas_formales_otra_emitida.sql', import.meta.url)

test('migration 076 wraps DDL and ACL changes in a single transaction', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /^BEGIN;/)
  assert.match(sql, /COMMIT;\s*$/)
})

test('migration 076 recreates listar_propuestas_formales additively with otra_propuesta_emitida', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(
    sql,
    /DROP FUNCTION IF EXISTS public\.listar_propuestas_formales\(\s*integer,\s*boolean,\s*text,\s*text\[\],\s*bigint,\s*integer,\s*integer\s*\);/i
  )

  const createIdx = sql.indexOf('CREATE FUNCTION public.listar_propuestas_formales')
  assert.ok(createIdx > -1)
  const body = sql.slice(createIdx)

  assert.match(body, /LANGUAGE sql/i)
  assert.match(body, /STABLE/)
  assert.match(body, /SECURITY INVOKER/)
  assert.match(body, /SET search_path = public/)
  // Preserves all pre-existing columns and their order, appends the new one right
  // before total_registros so existing consumers keep working (supabase.rpc() maps
  // by column name, not position).
  assert.match(body, /agente_id INT,\s*otra_propuesta_emitida BOOLEAN,\s*total_registros BIGINT/)
  assert.match(body, /COUNT\(\*\) OVER \(\) AS total_registros/)
})

test('migration 076 computes otra_propuesta_emitida as a sibling-scoped EXISTS check', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(
    sql,
    /EXISTS \(\s*SELECT 1\s*FROM propuestas_formales pf2\s*WHERE pf2\.carta_oferta_id = pf\.carta_oferta_id\s*AND pf2\.id <> pf\.id\s*AND pf2\.estado = 'emitida'\s*\)/
  )
})

test('migration 076 preserves the existing scoping, filters and pagination behavior', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const createIdx = sql.indexOf('CREATE FUNCTION public.listar_propuestas_formales')
  const body = sql.slice(createIdx)

  assert.match(body, /WHERE \(COALESCE\(p_es_admin, FALSE\) OR c\.agente_id = p_usuario_id\)/)
  assert.match(body, /pf\.estado = ANY\(p_estados\)/)
  assert.match(body, /pf\.carta_oferta_id = p_carta_oferta_id/)
  assert.match(
    body,
    /LIMIT LEAST\(GREATEST\(COALESCE\(p_limite,\s*20\),\s*1\),\s*100\)\s*OFFSET GREATEST\(COALESCE\(p_offset,\s*0\),\s*0\)/
  )
})

test('migration 076 reapplies service_role-only ACL after CREATE', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  const createIdx = sql.indexOf('CREATE FUNCTION public.listar_propuestas_formales')
  const revokeIdx = sql.indexOf('REVOKE ALL ON FUNCTION public.listar_propuestas_formales')
  const grantIdx = sql.indexOf('GRANT EXECUTE ON FUNCTION public.listar_propuestas_formales')
  assert.ok(revokeIdx > createIdx, 'REVOKE must come after CREATE')
  assert.ok(grantIdx > revokeIdx, 'GRANT must come after REVOKE')

  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.listar_propuestas_formales\([\s\S]*?\) FROM PUBLIC, authenticated, anon, service_role;/
  )
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.listar_propuestas_formales\([\s\S]*?\) TO service_role;/
  )
  assert.doesNotMatch(sql, /GRANT[\s\S]*TO\s+(anon|authenticated)\b/i)
})
