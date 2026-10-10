import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const migrationUrl = new URL('./082_numero_variante_ordinal.sql', import.meta.url)

// Quita los comentarios `--` para que las aserciones solo miren SQL ejecutable.
const sinComentarios = (sql) =>
  sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')

test('migration 082 replaces only the variant helper, keeping signature and attributes', async () => {
  const sql = sinComentarios(await readFile(migrationUrl, 'utf8'))

  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION _insertar_detalle_cotizacion\(\s*p_cotizacion_id INT,\s*p_ramo_id INT,\s*p_coberturas JSONB,\s*p_variantes JSONB\s*\)\s*RETURNS VOID\s*LANGUAGE plpgsql\s*SECURITY INVOKER\s*SET search_path = public/
  )
  assert.equal(sql.match(/CREATE OR REPLACE FUNCTION/g).length, 1)
})

test('migration 082 numbers variants as a per-quotation ordinal without touching the correlativo', async () => {
  const sql = sinComentarios(await readFile(migrationUrl, 'utf8'))

  assert.doesNotMatch(sql, /siguiente_correlativo/)
  assert.doesNotMatch(sql, /correlativos/)
  assert.match(sql, /v_numero_variante := v_numero_variante \+ 1/)
  assert.match(sql, /v_numero_variante\s+INT := 0/)
  assert.match(sql, /v_numero_variante::TEXT/)
})

test('migration 082 keeps the rest of the insert logic and adds no ACL or schema changes', async () => {
  const sql = sinComentarios(await readFile(migrationUrl, 'utf8'))

  assert.match(sql, /INSERT INTO cotizacion_coberturas/)
  assert.match(sql, /INSERT INTO cotizacion_variantes/)
  assert.match(sql, /INSERT INTO cotizacion_ajustes/)
  assert.match(sql, /INSERT INTO cotizacion_plan_pago/)
  assert.doesNotMatch(sql, /\bGRANT\b|\bREVOKE\b|ALTER TABLE|\bDROP\b/i)
  assert.doesNotMatch(sql, /crear_cotizacion_atomica|actualizar_cotizacion_atomica/)
})
