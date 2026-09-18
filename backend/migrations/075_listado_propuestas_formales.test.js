import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const migrationUrl = new URL('./075_listado_propuestas_formales.sql', import.meta.url)

test('migration 075 wraps DDL and ACL changes in a single transaction', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /^BEGIN;/)
  assert.match(sql, /COMMIT;\s*$/)
})

test('migration 075 recreates listar_cartas_oferta_aptas_propuesta additively with explicit signature', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(
    sql,
    /DROP FUNCTION IF EXISTS public\.listar_cartas_oferta_aptas_propuesta\(\s*integer,\s*boolean,\s*text,\s*integer\s*\);/i
  )

  const createIdx = sql.indexOf('CREATE FUNCTION public.listar_cartas_oferta_aptas_propuesta')
  const createSecondIdx = sql.indexOf('CREATE FUNCTION public.listar_propuestas_formales')
  assert.ok(createIdx > -1, 'expected CREATE FUNCTION for listar_cartas_oferta_aptas_propuesta')
  assert.ok(createSecondIdx > -1, 'expected CREATE FUNCTION for listar_propuestas_formales')

  const aptasBody = sql.slice(createIdx, createSecondIdx)
  assert.match(aptasBody, /propuesta_borrador_id BIGINT,/)
  assert.match(aptasBody, /propuesta_revision INT,/)
  assert.match(aptasBody, /tiene_propuesta BOOLEAN,/)
  assert.match(aptasBody, /propuesta_actual_id BIGINT,/)
  assert.match(aptasBody, /propuesta_actual_estado TEXT,/)
  assert.match(aptasBody, /propuesta_actual_numero BIGINT/)
  assert.match(aptasBody, /LANGUAGE sql/i)
  assert.match(aptasBody, /STABLE/)
  assert.match(aptasBody, /SECURITY INVOKER/)
  assert.match(aptasBody, /SET search_path = public/)
  assert.match(aptasBody, /LEFT JOIN LATERAL/i)
  assert.match(aptasBody, /ORDER BY[\s\S]*updated_at DESC,[\s\S]*id DESC/i)
})

test('migration 075 creates listar_propuestas_formales scoped by owner or admin with total count', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const createIdx = sql.indexOf('CREATE FUNCTION public.listar_propuestas_formales')
  const indexIdx = sql.indexOf('CREATE INDEX')
  assert.ok(createIdx > -1)
  assert.ok(indexIdx > createIdx)

  const body = sql.slice(createIdx, indexIdx)

  assert.match(
    body,
    /p_usuario_id INT,\s*p_es_admin BOOLEAN,\s*p_busqueda TEXT DEFAULT NULL,\s*p_estados TEXT\[\] DEFAULT NULL,\s*p_carta_oferta_id BIGINT DEFAULT NULL,\s*p_limite INT DEFAULT 20,\s*p_offset INT DEFAULT 0/
  )
  assert.match(body, /LANGUAGE sql/i)
  assert.match(body, /STABLE/)
  assert.match(body, /SECURITY INVOKER/)
  assert.match(body, /SET search_path = public/)
  assert.match(body, /COUNT\(\*\) OVER \(\) AS total_registros/)
  assert.match(body, /WHERE \(COALESCE\(p_es_admin, FALSE\) OR c\.agente_id = p_usuario_id\)/)
  assert.match(body, /pf\.estado = ANY\(p_estados\)/)
  assert.match(body, /pf\.carta_oferta_id = p_carta_oferta_id/)
  assert.match(
    body,
    /LIMIT LEAST\(GREATEST\(COALESCE\(p_limite,\s*20\),\s*1\),\s*100\)\s*OFFSET GREATEST\(COALESCE\(p_offset,\s*0\),\s*0\)/
  )
})

test('migration 075 adds the updated_at pagination index', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(
    sql,
    /CREATE INDEX IF NOT EXISTS propuestas_formales_updated_at_idx\s+ON propuestas_formales \(updated_at DESC, id DESC\);/
  )
})

test('migration 075 reapplies service_role-only ACL for both functions after CREATE', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  const aptasCreateIdx = sql.indexOf('CREATE FUNCTION public.listar_cartas_oferta_aptas_propuesta')
  const aptasRevokeIdx = sql.indexOf(
    'REVOKE ALL ON FUNCTION public.listar_cartas_oferta_aptas_propuesta'
  )
  const aptasGrantIdx = sql.indexOf(
    'GRANT EXECUTE ON FUNCTION public.listar_cartas_oferta_aptas_propuesta'
  )
  assert.ok(aptasRevokeIdx > aptasCreateIdx, 'REVOKE must come after CREATE for aptas function')
  assert.ok(aptasGrantIdx > aptasRevokeIdx, 'GRANT must come after REVOKE for aptas function')

  const nuevaCreateIdx = sql.indexOf('CREATE FUNCTION public.listar_propuestas_formales')
  const nuevaRevokeIdx = sql.indexOf('REVOKE ALL ON FUNCTION public.listar_propuestas_formales')
  const nuevaGrantIdx = sql.indexOf('GRANT EXECUTE ON FUNCTION public.listar_propuestas_formales')
  assert.ok(nuevaRevokeIdx > nuevaCreateIdx, 'REVOKE must come after CREATE for nueva function')
  assert.ok(nuevaGrantIdx > nuevaRevokeIdx, 'GRANT must come after REVOKE for nueva function')

  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.listar_cartas_oferta_aptas_propuesta\([\s\S]*?\) FROM PUBLIC, authenticated, anon, service_role;/
  )
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.listar_cartas_oferta_aptas_propuesta\([\s\S]*?\) TO service_role;/
  )
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
