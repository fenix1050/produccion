import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const migrationUrl = new URL('./066_cartas_oferta_documentales.sql', import.meta.url)
const fixedMigrationUrl = new URL(
  './067_fix_iniciar_carta_oferta_generacion_ambiguous_id.sql',
  import.meta.url
)
const estadoVersionFixedMigrationUrl = new URL(
  './068_fix_iniciar_carta_oferta_generacion_ambiguous_estado_version.sql',
  import.meta.url
)

function extractStartRpc(sql) {
  return sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION iniciar_carta_oferta_generacion'),
    sql.indexOf('CREATE OR REPLACE FUNCTION emitir_carta_oferta')
  )
}

test('migration 066 invalidates Carta Oferta records for every persisted commercial detail mutation', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /p_cotizacion_fuente->'cotizacion_coberturas'/)
  assert.match(sql, /p_cotizacion_fuente->'cotizacion_servicios'/)
  assert.match(sql, /p_cotizacion_fuente->'cotizacion_clausulas'/)
  assert.match(sql, /p_cotizacion_fuente->'cotizacion_variantes'/)
  assert.match(sql, /PERFORM pg_advisory_xact_lock\(p_cotizacion_id\)/)
  const startRpc = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION iniciar_carta_oferta_generacion'),
    sql.indexOf('CREATE OR REPLACE FUNCTION emitir_carta_oferta')
  )
  assert.doesNotMatch(startRpc, /FOR UPDATE/)
  assert.match(
    startRpc,
    /pg_advisory_xact_lock\(p_cotizacion_id\)[\s\S]*SELECT \* INTO v_cotizacion/
  )
  assert.match(
    sql,
    /CREATE TRIGGER cotizacion_coberturas_reemplazar_cartas_por_cambio\s+BEFORE INSERT OR UPDATE OR DELETE ON cotizacion_coberturas/
  )
  assert.match(
    sql,
    /CREATE TRIGGER cotizacion_servicios_reemplazar_cartas_por_cambio\s+BEFORE INSERT OR UPDATE OR DELETE ON cotizacion_servicios/
  )
  assert.match(
    sql,
    /CREATE TRIGGER cotizacion_clausulas_reemplazar_cartas_por_cambio\s+BEFORE INSERT OR UPDATE OR DELETE ON cotizacion_clausulas/
  )
  assert.match(
    sql,
    /CREATE TRIGGER cotizacion_variantes_reemplazar_cartas_por_cambio\s+BEFORE INSERT OR UPDATE OR DELETE ON cotizacion_variantes/
  )
  assert.match(
    sql,
    /CREATE TRIGGER cotizacion_plan_pago_reemplazar_cartas_por_cambio\s+BEFORE INSERT OR UPDATE OR DELETE ON cotizacion_plan_pago/
  )
  assert.match(
    sql,
    /CREATE TRIGGER cotizacion_ajustes_reemplazar_cartas_por_cambio\s+BEFORE INSERT OR UPDATE OR DELETE ON cotizacion_ajustes/
  )
})

test('migration 067 changes only the ambiguous quotation id reference in the Carta Oferta generation RPC', async () => {
  const [originalSql, fixedSql] = await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(fixedMigrationUrl, 'utf8'),
  ])
  const originalStartRpc = extractStartRpc(originalSql)
  const fixedStartRpc = extractStartRpc(
    `${fixedSql}\nCREATE OR REPLACE FUNCTION emitir_carta_oferta`
  )

  assert.match(fixedStartRpc, /FROM cotizaciones\s+WHERE cotizaciones\.id = p_cotizacion_id/)
  assert.equal(
    fixedStartRpc,
    originalStartRpc.replace(
      'WHERE id = p_cotizacion_id;',
      'WHERE cotizaciones.id = p_cotizacion_id;'
    )
  )
})

test('migration 068 changes only ambiguous Carta Oferta output-column table references in the generation RPC', async () => {
  const [previousSql, fixedSql] = await Promise.all([
    readFile(fixedMigrationUrl, 'utf8'),
    readFile(estadoVersionFixedMigrationUrl, 'utf8'),
  ])
  const previousStartRpc = extractStartRpc(
    `${previousSql}\nCREATE OR REPLACE FUNCTION emitir_carta_oferta`
  )
  const fixedStartRpc = extractStartRpc(
    `${fixedSql}\nCREATE OR REPLACE FUNCTION emitir_carta_oferta`
  )

  assert.match(
    fixedStartRpc,
    /AND cartas_oferta\.estado IN \('generando', 'error_pdf', 'emitida'\)/
  )
  assert.match(fixedStartRpc, /AND cartas_oferta\.estado = 'reemplazada'/)
  assert.match(fixedStartRpc, /ORDER BY cartas_oferta\.version DESC/)
  assert.doesNotMatch(fixedStartRpc, /AND estado (?:IN|=)/)
  assert.doesNotMatch(fixedStartRpc, /ORDER BY version DESC/)
  assert.equal(
    fixedStartRpc,
    previousStartRpc
      .replace(
        "AND estado IN ('generando', 'error_pdf', 'emitida');",
        "AND cartas_oferta.estado IN ('generando', 'error_pdf', 'emitida');"
      )
      .replace("AND estado = 'reemplazada'", "AND cartas_oferta.estado = 'reemplazada'")
      .replace('ORDER BY version DESC', 'ORDER BY cartas_oferta.version DESC')
  )
})

test('migration 066 includes agent, issue date, and validity in immutable snapshot freshness', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const startRpc = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION iniciar_carta_oferta_generacion'),
    sql.indexOf('CREATE OR REPLACE FUNCTION emitir_carta_oferta')
  )
  const headerInvalidation = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION reemplazar_cartas_por_recotizacion'),
    sql.indexOf('CREATE OR REPLACE FUNCTION reemplazar_cartas_por_cambio_detalle_cotizacion')
  )

  for (const field of ['agente_id', 'fecha', 'vigencia_dias']) {
    assert.match(startRpc, new RegExp(`p_cotizacion_fuente->>'${field}'`))
    assert.match(headerInvalidation, new RegExp(`OLD\\.${field} IS DISTINCT FROM NEW\\.${field}`))
  }
})

test('migration 066 freshness-checks every mutable joined render dependency', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const startRpc = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION iniciar_carta_oferta_generacion'),
    sql.indexOf('CREATE OR REPLACE FUNCTION emitir_carta_oferta')
  )

  for (const dependency of [
    "p_cotizacion_fuente->'usuario'",
    "p_cotizacion_fuente->'plan'",
    "p_cotizacion_fuente->'ramo'",
    "p_cotizacion_fuente->'plan_coberturas'",
    "'formas_pago'",
    "'codigo', fp.codigo",
    "'nombre_display', fp.nombre_display",
  ]) {
    assert.match(startRpc, new RegExp(dependency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }

  for (const trigger of [
    'formas_pago_reemplazar_cartas_por_cambio_render',
    'planes_reemplazar_cartas_por_cambio_render',
    'ramos_reemplazar_cartas_por_cambio_render',
    'plan_coberturas_reemplazar_cartas_por_cambio_render',
    'coberturas_catalogo_reemplazar_cartas_por_cambio_render',
    'usuarios_reemplazar_cartas_por_cambio_render',
    'roles_reemplazar_cartas_por_cambio_render',
  ]) {
    assert.match(sql, new RegExp(`CREATE TRIGGER ${trigger}`))
  }
  assert.match(
    sql,
    /reemplazar_cartas_por_cambio_dependencia_render[\s\S]*invalidar_cartas_oferta_por_cambios_comerciales/
  )
})

test('migration 066 returns the persisted canonical snapshot from the generation RPC', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const startRpc = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION iniciar_carta_oferta_generacion'),
    sql.indexOf('CREATE OR REPLACE FUNCTION emitir_carta_oferta')
  )

  assert.match(startRpc, /snapshot_json JSONB/)
  assert.match(
    startRpc,
    /RETURNING cartas_oferta\.id, cartas_oferta\.snapshot_json INTO v_carta\.id, v_carta\.snapshot_json/
  )
  assert.match(startRpc, /TRUE, TRUE, v_carta\.snapshot_json/)
})

test('migration 066 invalidates both source and destination Cartas during deterministic reparenting', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  const detailTrigger = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION reemplazar_cartas_por_cambio_detalle_cotizacion'),
    sql.indexOf('CREATE TRIGGER cotizaciones_reemplazar_cartas_por_recotizacion')
  )
  const multiInvalidation = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION invalidar_cartas_oferta_por_cambios_comerciales'),
    sql.indexOf('CREATE OR REPLACE FUNCTION reemplazar_cartas_por_recotizacion')
  )

  assert.match(
    detailTrigger,
    /TG_TABLE_NAME IN \([\s\S]*'cotizacion_coberturas',[\s\S]*'cotizacion_servicios',[\s\S]*'cotizacion_clausulas',[\s\S]*'cotizacion_variantes'[\s\S]*\)[\s\S]*OLD\.cotizacion_id[\s\S]*NEW\.cotizacion_id/
  )
  assert.match(
    detailTrigger,
    /TG_TABLE_NAME = 'cotizacion_plan_pago'[\s\S]*OLD\.variante_id[\s\S]*NEW\.variante_id/
  )
  assert.match(
    detailTrigger,
    /TG_TABLE_NAME = 'cotizacion_ajustes'[\s\S]*OLD\.variante_id[\s\S]*NEW\.variante_id/
  )
  assert.match(detailTrigger, /invalidar_cartas_oferta_por_cambios_comerciales\(/)
  assert.match(multiInvalidation, /SELECT DISTINCT cotizacion_id[\s\S]*ORDER BY cotizacion_id/)
})
