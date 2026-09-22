import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const migrationUrl = new URL('./077_pf3_mrc_content_correction.sql', import.meta.url)

const coverageEntries = [
  'Incendio de edificio y contenido, con extensión a rayo, explosión y humo conforme a las condiciones generales.',
  'Daños materiales por huracán, vendaval, ciclón, tornado e impacto de vehículos, cuando corresponda.',
  'Robo y asalto de contenido, mercaderías, mobiliario, equipos y enseres declarados.',
  'Rotura de cristales, vidrios y espejos dentro de los límites contratados.',
  'Responsabilidad civil por daños a terceros, hasta la suma asegurada indicada.',
]

const declarationBodies = [
  'Declaro que los datos consignados en esta propuesta son exactos, completos y verificables. La presente declaración constituye la base para el análisis del riesgo solicitado. Conozco que la omisión, reticencia o inexactitud relevante puede afectar la cobertura. Me obligo a comunicar cualquier modificación material del riesgo durante la vigencia. Reconozco que la aseguradora podrá requerir antecedentes y documentos complementarios. Autorizo la verificación de los datos declarados dentro de los límites legales aplicables. La aceptación definitiva queda sujeta a la evaluación técnica y administrativa correspondiente. Declaro que los bienes y actividades indicados se encuentran vinculados al giro comercial informado. Acepto las condiciones generales, particulares, anexos, límites y exclusiones aplicables. Comprendo que la póliza emitida prevalecerá como instrumento contractual definitivo. La presente propuesta no implica aceptación automática del riesgo por parte de la aseguradora.',
  'Declaro bajo fe de juramento que los fondos destinados al pago de la prima provienen de actividades lícitas. Los fondos guardan relación con el giro comercial y la capacidad económica declarados. No provienen de actividades prohibidas ni de operaciones que contravengan la normativa vigente. Me obligo a proporcionar documentación de respaldo cuando sea requerida por la aseguradora. También la proporcionaré cuando sea requerida por una autoridad competente. Comunicaré cualquier cambio relevante en el origen, uso o disponibilidad de los fondos declarados. Declaro que la información anterior fue suministrada libremente y refleja mi situación al momento de firmar. Comprendo que la aseguradora podrá conservar esta declaración durante el plazo previsto por la normativa. Acepto que la verificación de estos datos podrá realizarse antes o después de la emisión de la póliza.',
  'Autorizo la conservación de esta declaración, sus anexos y comunicaciones asociadas en soportes físicos o digitales. Acepto que la entrega de documentos por medios electrónicos se realice al correo indicado en esta propuesta. Reconozco como válidas las comunicaciones remitidas a los datos de contacto declarados y actualizados. Autorizo el envío de la póliza, endosos, avisos de pago, renovaciones y demás documentos vinculados. Acepto que la aseguradora mantenga un registro de las comunicaciones enviadas y recibidas. Me comprometo a informar de inmediato cualquier cambio de correo electrónico, domicilio o teléfono. Esta autorización no reemplaza las formalidades adicionales exigibles por ley o por el contrato. Autorizo el tratamiento de los datos necesarios para administrar esta solicitud y la relación contractual. Reconozco que la copia electrónica de los documentos se mantendrá disponible conforme a los canales habilitados. Acepto que los avisos de vencimiento se emitan con carácter informativo y no sustituyen la obligación de pago. La revocación de esta autorización deberá comunicarse por los canales formales definidos por la aseguradora.',
]

test('migration 077 appends the four approved MRC v3 text version 2 rows', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /BEGIN;/)
  assert.match(sql, /COMMIT;\s*$/)
  assert.match(
    sql,
    /INSERT INTO propuesta_textos \([\s\S]*version, contenido[\s\S]*ON CONFLICT \(producto_codigo, clave, version\) DO NOTHING/
  )
  assert.equal((sql.match(/'mrc',\n\s+'[^']+',\n\s+2,/g) ?? []).length, 4)
  assert.match(
    sql,
    /UPDATE propuesta_textos[\s\S]*SET publicado = FALSE[\s\S]*AND publicado = TRUE/
  )
  assert.match(sql, /'migracion_fuente_oficial'/)
  for (const key of [
    'coberturas_principales',
    'declaraciones_generales',
    'declaracion_jurada_origen_fondos',
    'autorizaciones_tomador_poliza_digital',
  ]) {
    assert.match(sql, new RegExp(`'${key}'`))
  }
})

test('migration 077 republishes existing version 2 rows after a rerun', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const insertIndex = sql.indexOf('ON CONFLICT (producto_codigo, clave, version) DO NOTHING;')
  const republishIndex = sql.indexOf('SET publicado = TRUE', insertIndex)

  assert.ok(insertIndex > -1)
  assert.ok(republishIndex > insertIndex)
  assert.match(
    sql.slice(republishIndex),
    /SET publicado = TRUE,\s*publicado_at = NOW\(\)[\s\S]*WHERE producto_codigo = 'mrc'[\s\S]*AND version = 2;/
  )
})

test('migration 077 preserves each supplied legal literal and independent coverage entry', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  for (const literal of [...coverageEntries, ...declarationBodies])
    assert.ok(sql.includes(literal), literal)
  assert.equal(
    coverageEntries.filter((entry) => sql.includes(`\n\n${entry}`)).length,
    coverageEntries.length
  )
})
