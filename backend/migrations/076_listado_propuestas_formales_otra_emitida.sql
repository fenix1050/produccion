BEGIN;

-- Adds `otra_propuesta_emitida` to listar_propuestas_formales (075): true when the
-- same Carta has ANOTHER propuesta_formales row in estado 'emitida'. Fixes an orphaned-
-- draft UX gap found live in TEST: a leftover 'borrador' created before 075's Historial
-- fix (when a Carta already had an emitida sibling) still offered "Continuar", which
-- always dead-ends in a 409 PF_CARTA_YA_TIENE_PROPUESTA_EMITIDA on emit. The listado
-- service now folds this into puede_continuar so the UI stops offering a dead-end action.
-- DROP+CREATE (not CREATE OR REPLACE) because RETURNS TABLE grows with a new column;
-- PostgreSQL rejects changing the output shape of an existing function.
DROP FUNCTION IF EXISTS public.listar_propuestas_formales(
    integer, boolean, text, text[], bigint, integer, integer
);

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
  otra_propuesta_emitida BOOLEAN,
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
    EXISTS (
      SELECT 1
      FROM propuestas_formales pf2
      WHERE pf2.carta_oferta_id = pf.carta_oferta_id
        AND pf2.id <> pf.id
        AND pf2.estado = 'emitida'
    ),
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

-- DROP FUNCTION erases the ACL fixed by 075 (which itself reapplied 070's), so it must
-- be reapplied explicitly again here.
REVOKE ALL ON FUNCTION public.listar_propuestas_formales(
    integer, boolean, text, text[], bigint, integer, integer
) FROM PUBLIC, authenticated, anon, service_role;

GRANT EXECUTE ON FUNCTION public.listar_propuestas_formales(
    integer, boolean, text, text[], bigint, integer, integer
) TO service_role;

COMMIT;
