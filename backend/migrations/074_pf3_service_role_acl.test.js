import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const migrationUrl = new URL('./074_pf3_service_role_acl.sql', import.meta.url)
const sql = fs.readFileSync(migrationUrl, 'utf8')

test('074 grants only the PF-3 table privileges required by service_role', () => {
  assert.match(
    sql,
    /GRANT\s+SELECT,\s*INSERT,\s*UPDATE\s+ON TABLE public\.propuesta_textos\s+TO service_role;/i
  )

  assert.match(
    sql,
    /GRANT\s+SELECT,\s*INSERT,\s*UPDATE\s+ON TABLE public\.propuesta_correlativos\s+TO service_role;/i
  )

  assert.match(
    sql,
    /GRANT\s+INSERT\s+ON TABLE public\.propuesta_formal_eventos\s+TO service_role;/i
  )

  assert.doesNotMatch(sql, /GRANT[\s\S]*DELETE[\s\S]*TO service_role/i)
})

test('074 grants sequence usage required by inserts', () => {
  assert.match(
    sql,
    /GRANT\s+USAGE\s+ON SEQUENCE public\.propuesta_textos_id_seq\s+TO service_role;/i
  )

  assert.match(
    sql,
    /GRANT\s+USAGE\s+ON SEQUENCE public\.propuesta_formal_eventos_id_seq\s+TO service_role;/i
  )
})

test('074 keeps browser roles away from PF-3 internal tables and sequences', () => {
  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES[\s\S]*public\.propuesta_textos,[\s\S]*public\.propuesta_correlativos,[\s\S]*public\.propuesta_formal_eventos[\s\S]*FROM anon, authenticated;/i
  )

  assert.match(
    sql,
    /REVOKE ALL PRIVILEGES[\s\S]*public\.propuesta_textos_id_seq,[\s\S]*public\.propuesta_formal_eventos_id_seq[\s\S]*FROM anon, authenticated;/i
  )

  assert.doesNotMatch(sql, /GRANT[\s\S]*TO\s+(anon|authenticated)\b/i)
})
