import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const migrationUrl = new URL('./078_pf3_mrc_condiciones_correction.sql', import.meta.url)

const paragraphs = [
  'Sub-límites de coberturas para daños o pérdidas como consecuencia de un riesgo cubierto, a primer riesgo absoluto para:',
  'Daños a murallas, cercos perimetrales y rejas: hasta la suma máxima de Gs. 1.000.000.- para cada vigencia. Daños por granizo: hasta la suma máxima de Gs. 5.000.000.- por cada vigencia para daños al edificio.',
  'Comercios ubicados en los departamentos de Itapúa y Alto Paraná posee 10% sobre todo y cada siniestro, mínimo de Gs. 500.000.- para la cobertura de Caída de Rayos.-',
  'Robo del contenido, valores en tránsito, valores caja fuerte, responsabilidad civil y Equipos Electrónicos de 10% sobre todo y cada siniestro, mínimo de Gs. 500.000.-',
]

const exclusionLines = [
  'Los riesgos que posean proceso de modificación de materia prima y que manejen materiales altamente combustible. Ejemplo: Panaderías, talleres mecánicos, supermercados, imprentas, carpinterías, mueblerías, gomerías entre otros.',
  'Se excluye además los carteles.',
  'Joyas, metales preciosos, títulos y papeles, obras de arte, entre otros.',
  'Variación de Tensión, Arcos Voltaicos.',
  'Cuando el edificio no posee los cuatro costados cerrados se excluye la cobertura de Huracán, vendaval, ciclón o tornado. Y si no cuenta con rejas de protección, el seguro de Robo fuera del horario habitual de tareas queda excluido.',
  'Para el seguro de Robo de Caja fuerte, se cubre el dinero circulante durante el horario habitual de tareas, pasado dicho horario el cliente debe depositar el efectivo en caja fuerte.',
  'Todas las demás exclusiones indicadas en el texto de Póliza obrante en la Web de la Compañía.',
  'La asegurada dará aviso fehaciente a la compañía de los cambios realizados al bien asegurado, que agraven el riesgo (Cláusula 10 - Condiciones Generales, art. 1580 C.Civil).-',
  'Que expresamente la propuesta de seguro y el informe de inspección del riesgo forman parte integrante del presente contrato de seguro.-',
  'Forman parte integrante de esta póliza la Cláusula de Adecuación al Código Penal y la cláusula de cobranzas y el endoso de garantía',
]

test('migration 078 appends the approved condiciones_mrc version 2 row', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /BEGIN;/)
  assert.match(sql, /COMMIT;\s*$/)
  assert.match(
    sql,
    /INSERT INTO propuesta_textos \([\s\S]*version, contenido[\s\S]*ON CONFLICT \(producto_codigo, clave, version\) DO NOTHING/
  )
  assert.match(sql, /'mrc',\n\s+'condiciones_mrc',\n\s+2,/)
  assert.match(
    sql,
    /UPDATE propuesta_textos[\s\S]*SET publicado = FALSE[\s\S]*AND clave = 'condiciones_mrc'[\s\S]*AND publicado = TRUE/
  )
  assert.match(sql, /'migracion_fuente_oficial'/)
})

test('migration 078 republishes an existing version 2 row after a rerun', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const insertIndex = sql.indexOf('ON CONFLICT (producto_codigo, clave, version) DO NOTHING;')
  const republishIndex = sql.indexOf('SET publicado = TRUE', insertIndex)

  assert.ok(insertIndex > -1)
  assert.ok(republishIndex > insertIndex)
  assert.match(
    sql.slice(republishIndex),
    /SET publicado = TRUE,\s*publicado_at = NOW\(\)[\s\S]*WHERE producto_codigo = 'mrc'[\s\S]*AND clave = 'condiciones_mrc'[\s\S]*AND version = 2;/
  )
})

test('migration 078 preserves each supplied paragraph and exclusion line, correctly separated', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  for (const paragraph of paragraphs) assert.ok(sql.includes(paragraph), paragraph)
  for (const line of exclusionLines) assert.ok(sql.includes(line), line)

  assert.match(sql, /para:\n\nDaños a murallas/)
  assert.match(sql, /al edificio\.\n\nFranquicias:\nComercios ubicados/)
  assert.match(sql, /de Caída de Rayos\.-\n\nRobo del contenido/)
  assert.match(sql, /mínimo de Gs\. 500\.000\.-\n\nExclusiones:\nLos riesgos/)
})
