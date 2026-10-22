import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const migrationUrl = new URL('./083_escape_comodines_busqueda_propuestas.sql', import.meta.url)

const FUNCTIONS = ['listar_cartas_oferta_aptas_propuesta', 'listar_propuestas_formales']

const functionBody = (sql, name) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  assert.ok(start > -1, `${name} must be redefined with CREATE OR REPLACE`)
  const end = sql.indexOf('$$;', sql.indexOf('AS $$', start))
  assert.ok(end > -1)
  return sql.slice(start, end)
}

test('migration 083 wraps the redefinitions in a single transaction', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /^BEGIN;/)
  assert.match(sql, /COMMIT;\s*$/)
})

test('migration 083 never concatenates p_busqueda raw into an ILIKE pattern', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.doesNotMatch(sql, /ILIKE\s+'%'\s*\|\|\s*BTRIM\(p_busqueda\)/i)
})

for (const name of FUNCTIONS) {
  test(`migration 083 escapes backslash, % and _ in ${name}`, async () => {
    const sql = await readFile(migrationUrl, 'utf8')
    const body = functionBody(sql, name)

    assert.match(
      body,
      /replace\(\s*replace\(\s*replace\(\s*BTRIM\(p_busqueda\),\s*'\\',\s*'\\\\'\s*\),\s*'%',\s*'\\%'\s*\),\s*'_',\s*'\\_'\s*\)/i
    )
    assert.match(body, /ILIKE\s+'%'\s*\|\|[\s\S]*?\|\|\s*'%'/i)
  })
}

test('migration 083 keeps the return shape so CREATE OR REPLACE preserves the ACL', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.doesNotMatch(sql, /DROP FUNCTION/i)
  assert.match(
    functionBody(sql, 'listar_propuestas_formales'),
    /otra_propuesta_emitida BOOLEAN,\s*total_registros BIGINT/
  )
  assert.match(
    functionBody(sql, 'listar_cartas_oferta_aptas_propuesta'),
    /propuesta_actual_numero BIGINT/
  )
})

test('migration 083 keeps search_path pinned and does not grant anon/authenticated', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  for (const name of FUNCTIONS) {
    const body = functionBody(sql, name)
    assert.match(body, /SECURITY INVOKER/)
    assert.match(body, /SET search_path = public/)
  }
  assert.doesNotMatch(sql, /GRANT[\s\S]*TO\s+(anon|authenticated)\b/i)
})
