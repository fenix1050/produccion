import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const migrationUrl = new URL('./071_propuestas_formales_emision_mrc.sql', import.meta.url)

const CLAUSULA_FIRMA_DIGITAL_FUENTE_MRC =
  'las cuales estarán firmadas con el uso de la firma digital (de conformidad con lo establecido en la Ley N° 4.017/2.010 y sus posteriores versiones modificatorias, y en las resoluciones vigentes de la Superintendencia de Seguros emitidas para el efecto, cuyas copias se encuentran disponibles en www.tajy.com.py);'

test('migration 071 makes MRC issuance private, atomic, numbered, and auditable', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /ADD COLUMN numero_propuesta BIGINT UNIQUE/)
  assert.match(sql, /CREATE TABLE propuesta_correlativos/)
  assert.match(sql, /pg_advisory_xact_lock\(v_propuesta\.carta_oferta_id\)/)
  assert.match(
    sql,
    /ON CONFLICT \(producto_codigo\) DO UPDATE SET ultimo_numero = propuesta_correlativos\.ultimo_numero \+ 1/
  )
  assert.match(
    sql,
    /CREATE UNIQUE INDEX propuestas_formales_carta_emitida_unique[\s\S]*WHERE estado = 'emitida'/
  )
  assert.match(sql, /CREATE TABLE propuesta_formal_eventos/)
  assert.match(
    sql,
    /INSERT INTO storage\.buckets \(id, name, public\)[\s\S]*'propuestas-formales-privadas', 'propuestas-formales-privadas', FALSE/
  )
  assert.match(sql, /ALTER TABLE public\.propuesta_textos ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /ALTER TABLE public\.propuesta_formal_eventos ENABLE ROW LEVEL SECURITY/)
  assert.doesNotMatch(sql, /CREATE POLICY/)
  assert.match(sql, /'migracion_fuente_oficial'/)
  for (const clave of [
    'coberturas_principales',
    'declaraciones_generales',
    'declaracion_jurada_origen_fondos',
    'autorizaciones_tomador_poliza_digital',
    'condiciones_mrc',
    'clausula_adicional_cobranzas',
  ]) {
    assert.match(sql, new RegExp(`'${clave}'`))
  }
  assert.doesNotMatch(sql, /@/)
})

test('migration 071 preserves the complete official digital-document availability clause', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.ok(
    sql.includes(CLAUSULA_FIRMA_DIGITAL_FUENTE_MRC),
    'The approved MRC digital-document availability clause must remain a complete verbatim seed fragment'
  )
})

test('migration 071 retains immutable emitted artifacts and requires annulment evidence', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /estado NOT IN \('emitida', 'anulada'\) OR \([\s\S]*pdf_hash IS NOT NULL/)
  assert.match(sql, /CREATE OR REPLACE FUNCTION anular_propuesta_formal/)
  assert.match(sql, /PF_MOTIVO_ANULACION_REQUERIDO/)
  assert.match(sql, /anulada_por = p_actor_id,[\s\S]*anulada_at = NOW\(\)/)
  assert.match(sql, /reemplaza_propuesta_id = COALESCE/)
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION iniciar_emision_propuesta_formal/)
  assert.match(sql, /OLD\.estado = 'anulada' AND NEW\.estado IS DISTINCT FROM OLD\.estado/)
  assert.match(sql, /OLD\.estado = 'emitida' AND NEW\.estado NOT IN \('emitida', 'anulada'\)/)
  assert.match(sql, /OLD\.numero_propuesta IS DISTINCT FROM NEW\.numero_propuesta/)
  assert.match(sql, /OLD\.motivo_anulacion IS DISTINCT FROM NEW\.motivo_anulacion/)
})
