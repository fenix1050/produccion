import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import { evaluarReadiness } from '../src/services/propuestas/readiness.service.js'

const migrationUrl = new URL('./069_propuestas_formales_borradores.sql', import.meta.url)

test('migration 069 creates default-deny persistent drafts with one active draft per Carta', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /CREATE TABLE propuestas_formales/)
  assert.match(sql, /carta_oferta_id BIGINT NOT NULL REFERENCES cartas_oferta\(id\)/)
  assert.match(sql, /draft_json JSONB NOT NULL DEFAULT '\{\}'::JSONB/)
  assert.match(sql, /pg_column_size\(draft_json\) <= 262144/)
  assert.match(sql, /ALTER TABLE public\.propuestas_formales ENABLE ROW LEVEL SECURITY/)
  assert.doesNotMatch(sql, /CREATE POLICY/)
  assert.match(
    sql,
    /CREATE UNIQUE INDEX propuestas_formales_borrador_activo_unique[\s\S]*WHERE estado IN \('borrador', 'en_revision', 'generando_pdf', 'error_pdf'\)/
  )
})

test('migration 069 centralizes MRC eligibility, ownership, validity, and active Carta state', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const eligibility = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION motivo_ineligibilidad_carta_propuesta'),
    sql.indexOf('CREATE OR REPLACE FUNCTION validar_seleccion_propuesta_formal')
  )

  assert.match(eligibility, /v_cotizacion\.agente_id <> p_usuario_id/)
  assert.match(eligibility, /NOT COALESCE\(p_es_admin, FALSE\)/)
  assert.match(eligibility, /v_carta\.producto_codigo <> 'mrc'/)
  assert.match(eligibility, /v_carta\.estado <> 'emitida'/)
  assert.match(
    eligibility,
    /v_cotizacion\.fecha \+ COALESCE\(v_cotizacion\.vigencia_dias, 30\) < CURRENT_DATE/
  )
})

test('migration 069 validates selection references and performs optimistic updates transactionally', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const selection = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION validar_seleccion_propuesta_formal'),
    sql.indexOf('CREATE OR REPLACE FUNCTION listar_cartas_oferta_aptas_propuesta')
  )
  const update = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION actualizar_propuesta_borrador'))

  assert.match(selection, /v_cotizacion_variante_id IS DISTINCT FROM v_cotizacion_carta_id/)
  assert.match(selection, /v_variante_plan_pago_id IS DISTINCT FROM NEW\.cotizacion_variante_id/)
  assert.match(update, /FOR UPDATE/)
  assert.match(update, /v_propuesta\.revision <> p_revision_esperada/)
  assert.match(update, /PF_REVISION_CONFLICT/)
  assert.match(update, /revision = propuestas_formales\.revision \+ 1/)
  assert.doesNotMatch(update, /premio_total\s*=/)
})

test('migration 069 serializes create-or-recover and keeps stale-Carta drafts editable', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const create = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION crear_o_recuperar_propuesta_borrador'),
    sql.indexOf('CREATE OR REPLACE FUNCTION actualizar_propuesta_borrador')
  )
  const update = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION actualizar_propuesta_borrador'))

  assert.match(create, /pg_advisory_xact_lock\(p_carta_id\)/)
  assert.match(create, /jsonb_build_object\('creado', FALSE\)/)
  assert.match(create, /jsonb_build_object\('creado', TRUE\)/)
  assert.match(update, /A draft remains editable if its Carta expires/)
  assert.match(update, /CARTA_SIN_PERMISO/)
})

test('requotation clears obsolete selection references while preserving the PF-2 draft as incomplete', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(
    sql,
    /cotizacion_variante_id INT REFERENCES cotizacion_variantes\(id\) ON DELETE SET NULL/
  )
  assert.match(
    sql,
    /cotizacion_plan_pago_id INT REFERENCES cotizacion_plan_pago\(id\) ON DELETE SET NULL/
  )
  assert.doesNotMatch(sql, /cotizacion_(?:variante|plan_pago)_id INT NOT NULL/)
  assert.doesNotMatch(
    sql,
    /cotizacion_(?:variante|plan_pago)_id INT REFERENCES [^\n]+ ON DELETE CASCADE/
  )
  assert.doesNotMatch(sql, /CONSTRAINT propuestas_formales_seleccion_completa CHECK/)
  assert.match(
    sql,
    /IF NEW\.cotizacion_variante_id IS NULL OR NEW\.cotizacion_plan_pago_id IS NULL THEN/
  )
  assert.match(
    sql,
    /IF \(p_cotizacion_variante_id IS NULL\) <> \(p_cotizacion_plan_pago_id IS NULL\) THEN[\s\S]*RAISE EXCEPTION 'PF_SELECCION_INVALIDA'/
  )

  const readiness = evaluarReadiness({
    propuesta: {
      carta_oferta_id: 7,
      cotizacion_variante_id: null,
      cotizacion_plan_pago_id: null,
      draft_json: {
        partes: {
          asegurado: {
            tipo_persona: 'juridica',
            nombre_razon_social: 'Comercio SA',
            documento: '80000000-1',
            direccion: 'Asunción',
            telefono: '021000000',
            actividad_economica: 'Comercio',
          },
        },
        pla_ft: {
          es_pep: false,
          sujeto_obligado: false,
          origen_fondos_descripcion: 'Ingresos operativos',
        },
      },
    },
    carta: { id: 7 },
  })

  assert.equal(readiness.listo, false)
  assert.deepEqual(readiness.pendientes, ['seleccion_comercial'])
  assert.equal(readiness.emision_habilitada, false)
})
