-- PF-3 MRC prerequisite verifier v1.0 (read-only PostgreSQL catalog inspection).
-- Ubuntu invocation with a preconfigured service: PGSERVICE=pf3_test psql -X -f backend/scripts/verify_pf3_mrc_prerequisites_v1.sql
-- Ubuntu invocation with a securely provisioned variable: psql -X "$DATABASE_URL" -f backend/scripts/verify_pf3_mrc_prerequisites_v1.sql
\set ON_ERROR_STOP on

BEGIN TRANSACTION READ ONLY;

WITH transaction_state AS (
  SELECT current_setting('transaction_read_only') AS setting_value
),
function_candidates AS (
  SELECT
    p.oid,
    pg_get_functiondef(p.oid) AS definition
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'iniciar_carta_oferta_generacion'
),
function_summary AS (
  SELECT
    COUNT(*) AS function_count,
    COALESCE(bool_and(
      definition ~ 'FROM[[:space:]]+cotizaciones[[:space:]]+WHERE[[:space:]]+cotizaciones[.]id[[:space:]]*=[[:space:]]*p_cotizacion_id'
      AND definition !~ 'FROM[[:space:]]+cotizaciones[[:space:]]+WHERE[[:space:]]+id[[:space:]]*=[[:space:]]*p_cotizacion_id'
    ), FALSE) AS has_067_qualified_cotizacion_id,
    COALESCE(bool_and(
      definition ~ 'AND[[:space:]]+cartas_oferta[.]estado[[:space:]]+IN[[:space:]]*[(][[:space:]]*''generando''[[:space:]]*,[[:space:]]*''error_pdf''[[:space:]]*,[[:space:]]*''emitida''[[:space:]]*[)]'
      AND definition !~ 'AND[[:space:]]+estado[[:space:]]+IN'
    ), FALSE) AS has_068_qualified_active_estado,
    COALESCE(bool_and(
      definition ~ 'AND[[:space:]]+cartas_oferta[.]estado[[:space:]]*=[[:space:]]*''reemplazada'''
      AND definition !~ 'AND[[:space:]]+estado[[:space:]]*='
    ), FALSE) AS has_068_qualified_replaced_estado,
    COALESCE(bool_and(
      definition ~ 'ORDER[[:space:]]+BY[[:space:]]+cartas_oferta[.]version[[:space:]]+DESC'
      AND definition !~ 'ORDER[[:space:]]+BY[[:space:]]+version[[:space:]]+DESC'
    ), FALSE) AS has_068_qualified_version_order
  FROM function_candidates
),
requested_triggers(sort_order, trigger_name) AS (
  VALUES
    (1, 'cartas_oferta_proteger_snapshot'),
    (2, 'cotizaciones_reemplazar_cartas_por_recotizacion'),
    (3, 'cotizacion_coberturas_reemplazar_cartas_por_cambio'),
    (4, 'cotizacion_servicios_reemplazar_cartas_por_cambio'),
    (5, 'cotizacion_clausulas_reemplazar_cartas_por_cambio'),
    (6, 'cotizacion_variantes_reemplazar_cartas_por_cambio'),
    (7, 'cotizacion_plan_pago_reemplazar_cartas_por_cambio'),
    (8, 'cotizacion_ajustes_reemplazar_cartas_por_cambio'),
    (9, 'formas_pago_reemplazar_cartas_por_cambio_render'),
    (10, 'planes_reemplazar_cartas_por_cambio_render'),
    (11, 'ramos_reemplazar_cartas_por_cambio_render'),
    (12, 'plan_coberturas_reemplazar_cartas_por_cambio_render'),
    (13, 'coberturas_catalogo_reemplazar_cartas_por_cambio_render'),
    (14, 'usuarios_reemplazar_cartas_por_cambio_render'),
    (15, 'roles_reemplazar_cartas_por_cambio_render')
),
trigger_summary AS (
  SELECT
    r.sort_order,
    r.trigger_name,
    COUNT(t.oid) AS trigger_count,
    COALESCE(bool_and(t.tgenabled IN ('O', 'R', 'A')), FALSE) AS is_enabled,
    COALESCE(
      string_agg(c.relname::text || ' (tgenabled=' || t.tgenabled::text || ')', ', ' ORDER BY c.relname, t.tgenabled),
      '(missing)'
    ) AS observed_relation_and_state
  FROM requested_triggers AS r
  LEFT JOIN pg_trigger AS t ON t.tgname = r.trigger_name
  LEFT JOIN pg_class AS c ON c.oid = t.tgrelid
  GROUP BY r.sort_order, r.trigger_name
),
checks(sort_order, check_key, expected_condition, observed, result) AS (
  SELECT
    1,
    'transaction_read_only',
    'transaction_read_only is on',
    transaction_state.setting_value,
    CASE WHEN transaction_state.setting_value = 'on' THEN 'PASS' ELSE 'FAIL' END
  FROM transaction_state

  UNION ALL

  SELECT
    2,
    'iniciar_carta_oferta_generacion.function_count',
    'exactly one public function with this name',
    function_summary.function_count::TEXT,
    CASE WHEN function_summary.function_count = 1 THEN 'PASS' ELSE 'FAIL' END
  FROM function_summary

  UNION ALL

  SELECT
    3,
    'iniciar_carta_oferta_generacion.067_qualified_cotizacion_id',
    'one function and qualified cotizaciones.id = p_cotizacion_id only',
    function_summary.has_067_qualified_cotizacion_id::TEXT,
    CASE WHEN function_summary.function_count = 1 AND function_summary.has_067_qualified_cotizacion_id THEN 'PASS' ELSE 'FAIL' END
  FROM function_summary

  UNION ALL

  SELECT
    4,
    'iniciar_carta_oferta_generacion.068_qualified_active_estado',
    'one function and qualified active cartas_oferta.estado condition only',
    function_summary.has_068_qualified_active_estado::TEXT,
    CASE WHEN function_summary.function_count = 1 AND function_summary.has_068_qualified_active_estado THEN 'PASS' ELSE 'FAIL' END
  FROM function_summary

  UNION ALL

  SELECT
    5,
    'iniciar_carta_oferta_generacion.068_qualified_replaced_estado',
    'one function and qualified replaced cartas_oferta.estado condition only',
    function_summary.has_068_qualified_replaced_estado::TEXT,
    CASE WHEN function_summary.function_count = 1 AND function_summary.has_068_qualified_replaced_estado THEN 'PASS' ELSE 'FAIL' END
  FROM function_summary

  UNION ALL

  SELECT
    6,
    'iniciar_carta_oferta_generacion.068_qualified_version_order',
    'one function and ORDER BY cartas_oferta.version DESC only',
    function_summary.has_068_qualified_version_order::TEXT,
    CASE WHEN function_summary.function_count = 1 AND function_summary.has_068_qualified_version_order THEN 'PASS' ELSE 'FAIL' END
  FROM function_summary

  UNION ALL

  SELECT
    100 + trigger_summary.sort_order,
    'trigger.' || trigger_summary.trigger_name,
    'exists exactly once and is enabled',
    'count=' || trigger_summary.trigger_count::TEXT || '; ' || trigger_summary.observed_relation_and_state,
    CASE WHEN trigger_summary.trigger_count = 1 AND trigger_summary.is_enabled THEN 'PASS' ELSE 'FAIL' END
  FROM trigger_summary
)
SELECT check_key, expected_condition, observed, result
FROM checks
ORDER BY sort_order;

ROLLBACK;
