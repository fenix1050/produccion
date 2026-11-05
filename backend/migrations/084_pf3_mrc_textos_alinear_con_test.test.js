import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const migrationUrl = new URL('./084_pf3_mrc_textos_alinear_con_test.sql', import.meta.url)

// md5 of the content published in TEST on 2026-11-05 (reference model: Propuesta N.º 23).
const TEST_HASHES = {
  declaraciones_generales: '5ca3863fa4e76358f961a613ca227f33',
  declaracion_jurada_origen_fondos: '960b9187013bc7a83922c22e82a6c952',
  condiciones_mrc: '6848a40ccc10da7592e686c1efae22e2',
  autorizaciones_tomador_poliza_digital: '64e18f158795738cb893f26a7e7fd88d',
}

// Rows already identical in TEST and PROD: the migration must not touch them.
const UNTOUCHED_KEYS = ['coberturas_principales', 'clausula_adicional_cobranzas']

function targets(sql) {
  const found = {}
  for (const match of sql.matchAll(/\(\s*'(\w+)',\s*\$\$([\s\S]*?)\$\$\s*\)/g)) {
    found[match[1]] = match[2]
  }
  return found
}

const md5 = (value) => createHash('md5').update(value, 'utf8').digest('hex')

test('migration 084 carries exactly the four TEST texts, byte for byte', async () => {
  const found = targets(await readFile(migrationUrl, 'utf8'))

  assert.deepEqual(Object.keys(found).sort(), Object.keys(TEST_HASHES).sort())
  for (const [clave, hash] of Object.entries(TEST_HASHES)) {
    assert.equal(md5(found[clave]), hash, `content of ${clave} matches TEST`)
  }
})

test('migration 084 leaves the keys that already match untouched', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  for (const clave of UNTOUCHED_KEYS) {
    assert.doesNotMatch(sql, new RegExp(`'${clave}'`))
  }
})

test('migration 084 publishes the next version, only where the published content differs', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /BEGIN;/)
  assert.match(sql, /COMMIT;\s*$/)
  // Idempotence guard: a key whose published content already equals the target is skipped.
  assert.match(
    sql,
    /CREATE TEMP TABLE _textos_pendientes[\s\S]*WHERE NOT EXISTS[\s\S]*p\.publicado[\s\S]*p\.contenido = o\.contenido/
  )
  // Immutability: unpublish the old pointer and insert a NEW version; never rewrite contenido.
  assert.match(sql, /UPDATE propuesta_textos[\s\S]*SET publicado = FALSE[\s\S]*_textos_pendientes/)
  assert.match(sql, /COALESCE\(MAX\(version\), 0\) \+ 1/)
  assert.match(sql, /'migracion_fuente_oficial'/)
  assert.doesNotMatch(sql, /SET\s+contenido\s*=/i)
  assert.doesNotMatch(sql, /DELETE FROM propuesta_textos/i)
})

test('migration 084 targets only the mrc product', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.doesNotMatch(sql, /producto_codigo\s*=\s*'(?!mrc')/)
  assert.match(sql, /producto_codigo = 'mrc'/)
})
