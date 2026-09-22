import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const migrationUrl = new URL('./079_pf3_mrc_coberturas_principales_correction.sql', import.meta.url)

const lines = [
  'Coberturas Principales:',
  'Incendio, Rayo y Explosión;',
  'Incendio y daños materiales por Huracán, Vendaval, Ciclón o Tornados;',
  'Incendio y daños materiales por Tumulto y/o Alboroto Popular y/o Huelga que revista tales caracteres, siempre que no sean por motivos políticos;',
  'Daños materiales por Caída de Aeronaves y/o de sus partes componentes;',
  'Daños materiales por Impacto de vehículos terrestres de terceros;',
  'Daños materiales por Humo y Hollín;',
  'Robo y/o Asalto del Contenido.-',
  'Robo (Caja registradora).-',
  'Robo (Tránsito).-',
  'Rotura de Cristales, Vidrios o Espejos.-',
  'Responsabilidad Civil.-',
  'Distribución del Capital Asegurado:',
  'Sublímite para Circuito Cerrado de televisión (Cámaras de Seguridad): Gs. 5.000.000.-',
  'Sublímite para Daños por agua: Gs. 2.000.000.-',
]

test('migration 079 appends the approved coberturas_principales version 3 row', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /BEGIN;/)
  assert.match(sql, /COMMIT;\s*$/)
  assert.match(
    sql,
    /INSERT INTO propuesta_textos \([\s\S]*version, contenido[\s\S]*ON CONFLICT \(producto_codigo, clave, version\) DO NOTHING/
  )
  assert.match(sql, /'mrc',\n\s+'coberturas_principales',\n\s+3,/)
  assert.match(
    sql,
    /UPDATE propuesta_textos[\s\S]*SET publicado = FALSE[\s\S]*AND clave = 'coberturas_principales'[\s\S]*AND publicado = TRUE/
  )
  assert.match(sql, /'migracion_fuente_oficial'/)
})

test('migration 079 republishes an existing version 3 row after a rerun', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const insertIndex = sql.indexOf('ON CONFLICT (producto_codigo, clave, version) DO NOTHING;')
  const republishIndex = sql.indexOf('SET publicado = TRUE', insertIndex)

  assert.ok(insertIndex > -1)
  assert.ok(republishIndex > insertIndex)
  assert.match(
    sql.slice(republishIndex),
    /SET publicado = TRUE,\s*publicado_at = NOW\(\)[\s\S]*WHERE producto_codigo = 'mrc'[\s\S]*AND clave = 'coberturas_principales'[\s\S]*AND version = 3;/
  )
})

test('migration 079 preserves every supplied coverage line', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  for (const line of lines) assert.ok(sql.includes(line), line)
})

test('migration 079 keeps the fire and Distribución del Capital Asegurado tables as pipe-delimited rows', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /Incendio\nMercadería \| Muebles, Equipos y Enseres\n50% \| 50%/)
  assert.match(sql, /Robo\nMercadería \| Equipos \| Mueble\n60% \| 10% \| 30%/)
})

test('migration 079 keeps "Coberturas Principales:" and its primary item on adjacent lines with no blank line', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /Coberturas Principales:\nIncendio, Rayo y Explosión;\n\n/)
})
