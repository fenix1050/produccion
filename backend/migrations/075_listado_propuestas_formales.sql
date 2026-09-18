BEGIN;

-- Listado de Propuestas Formales: additive change to the existing readiness listing
-- function plus a new scoped/paginated listing function for propuestas_formales.
-- DROP+CREATE (not CREATE OR REPLACE) is required because RETURNS TABLE grows with
-- new columns; PostgreSQL rejects changing the output shape of an existing function.
-- supabase.rpc() maps results by column name, so the existing wizard code keeps
-- working against propuesta_borrador_id/propuesta_revision unmodified.
DROP FUNCTION IF EXISTS public.listar_cartas_oferta_aptas_propuesta(
    integer, boolean, text, integer
);

CREATE FUNCTION public.listar_cartas_oferta_aptas_propuesta(
  p_usuario_id INT,
  p_es_admin BOOLEAN,
  p_busqueda TEXT DEFAULT NULL,
  p_limite INT DEFAULT 50
)
RETURNS TABLE (
  id BIGINT,
  cotizacion_id INT,
  numero_carta TEXT,
  version INT,
  producto_codigo TEXT,
  cliente_nombre TEXT,
  fecha DATE,
  fecha_vencimiento DATE,
  moneda TEXT,
  propuesta_borrador_id BIGINT,
  propuesta_revision INT,
  tiene_propuesta BOOLEAN,
  propuesta_actual_id BIGINT,
  propuesta_actual_estado TEXT,
  propuesta_actual_numero BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    ca.id,
    c.id,
    ca.numero_carta::TEXT,
    ca.version,
    ca.producto_codigo::TEXT,
    c.cliente_nombre::TEXT,
    c.fecha,
    c.fecha + COALESCE(c.vigencia_dias, 30),
    c.moneda::TEXT,
    pf.id,
    pf.revision,
    ultima.id IS NOT NULL,
    ultima.id,
    ultima.estado::TEXT,
    ultima.numero_propuesta
  FROM cartas_oferta AS ca
  JOIN cotizaciones AS c ON c.id = ca.cotizacion_id
  LEFT JOIN propuestas_formales AS pf
    ON pf.carta_oferta_id = ca.id
   AND pf.estado IN ('borrador', 'en_revision', 'generando_pdf', 'error_pdf')
  LEFT JOIN LATERAL (
    SELECT propuestas_formales.id, propuestas_formales.estado, propuestas_formales.numero_propuesta
    FROM propuestas_formales
    WHERE propuestas_formales.carta_oferta_id = ca.id
      AND propuestas_formales.estado IN (
        'borrador', 'en_revision', 'generando_pdf', 'error_pdf', 'emitida'
      )
    ORDER BY propuestas_formales.updated_at DESC, propuestas_formales.id DESC
    LIMIT 1
  ) AS ultima ON TRUE
  WHERE motivo_ineligibilidad_carta_propuesta(ca.id, p_usuario_id, p_es_admin) IS NULL
    AND (
      NULLIF(BTRIM(COALESCE(p_busqueda, '')), '') IS NULL
      OR ca.numero_carta ILIKE '%' || BTRIM(p_busqueda) || '%'
      OR c.cliente_nombre ILIKE '%' || BTRIM(p_busqueda) || '%'
    )
  ORDER BY ca.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limite, 50), 1), 100);
$$;

-- Scoped, searchable, paginated listing of Propuestas Formales. Joins across
-- propuestas_formales -> cartas_oferta -> cotizaciones so the search and the
-- agent/admin scoping stay a single round-trip and a single consistent snapshot;
-- expressing this as PostgREST embeds risks a horizontal leak without !inner
-- (see coberturas.repository.js) and `or=` cannot reach across embeds.
CREATE FUNCTION public.listar_propuestas_formales(
  p_usuario_id INT,
  p_es_admin BOOLEAN,
  p_busqueda TEXT DEFAULT NULL,
  p_estados TEXT[] DEFAULT NULL,
  p_carta_oferta_id BIGINT DEFAULT NULL,
  p_limite INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id BIGINT,
  numero_propuesta BIGINT,
  estado TEXT,
  revision INT,
  carta_oferta_id BIGINT,
  numero_carta TEXT,
  cotizacion_id INT,
  cliente_nombre TEXT,
  moneda TEXT,
  producto_codigo TEXT,
  pdf_storage_path TEXT,
  emitida_at TIMESTAMPTZ,
  anulada_at TIMESTAMPTZ,
  motivo_anulacion TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  agente_id INT,
  total_registros BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    pf.id,
    pf.numero_propuesta,
    pf.estado::TEXT,
    pf.revision,
    pf.carta_oferta_id,
    ca.numero_carta::TEXT,
    c.id,
    c.cliente_nombre::TEXT,
    c.moneda::TEXT,
    ca.producto_codigo::TEXT,
    pf.pdf_storage_path,
    pf.emitida_at,
    pf.anulada_at,
    pf.motivo_anulacion,
    pf.created_at,
    pf.updated_at,
    c.agente_id,
    COUNT(*) OVER () AS total_registros
  FROM propuestas_formales pf
  JOIN cartas_oferta ca ON ca.id = pf.carta_oferta_id
  JOIN cotizaciones c ON c.id = ca.cotizacion_id
  WHERE (COALESCE(p_es_admin, FALSE) OR c.agente_id = p_usuario_id)
    AND (p_estados IS NULL OR pf.estado = ANY(p_estados))
    AND (p_carta_oferta_id IS NULL OR pf.carta_oferta_id = p_carta_oferta_id)
    AND (
      NULLIF(BTRIM(COALESCE(p_busqueda, '')), '') IS NULL
      OR pf.numero_propuesta::TEXT ILIKE '%' || BTRIM(p_busqueda) || '%'
      OR ca.numero_carta ILIKE '%' || BTRIM(p_busqueda) || '%'
      OR c.cliente_nombre ILIKE '%' || BTRIM(p_busqueda) || '%'
    )
  ORDER BY pf.updated_at DESC, pf.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limite, 20), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

CREATE INDEX IF NOT EXISTS propuestas_formales_updated_at_idx
  ON propuestas_formales (updated_at DESC, id DESC);

-- DROP FUNCTION erases the ACL fixed by 070_fix_carta_oferta_rpc_acl.sql:325-331,
-- so both functions must have their service_role-only ACL reapplied explicitly.
REVOKE ALL ON FUNCTION public.listar_cartas_oferta_aptas_propuesta(
    integer, boolean, text, integer
) FROM PUBLIC, authenticated, anon, service_role;

GRANT EXECUTE ON FUNCTION public.listar_cartas_oferta_aptas_propuesta(
    integer, boolean, text, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.listar_propuestas_formales(
    integer, boolean, text, text[], bigint, integer, integer
) FROM PUBLIC, authenticated, anon, service_role;

GRANT EXECUTE ON FUNCTION public.listar_propuestas_formales(
    integer, boolean, text, text[], bigint, integer, integer
) TO service_role;

COMMIT;
