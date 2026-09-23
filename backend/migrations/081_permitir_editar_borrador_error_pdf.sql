BEGIN;

-- Fixes a real dead-end found live in TEST: a draft whose last emission attempt failed
-- (estado = 'error_pdf', ej. PF_PDF_FIT_OVERFLOW) could not be edited at all —
-- actualizar_propuesta_borrador only allowed estado = 'borrador'. Any save attempt (like
-- filling a field the wizard now requires, e.g. "sexo") raised PF_BORRADOR_NO_EDITABLE
-- (409), which the frontend showed as "changed in another tab, reload" — a message that
-- did not describe the real cause and that reloading could never fix, since the
-- underlying estado stayed 'error_pdf' no matter how many times the page reloaded.
--
-- iniciar_emision_propuesta_formal (073) already treats 'error_pdf' as re-enterable
-- exactly like 'borrador' (its own guard is `estado NOT IN ('borrador', 'error_pdf')`,
-- and it preserves or overwrites the snapshot depending on that same state) — the intent
-- was always that a failed-PDF draft stays editable so its content can be corrected
-- before retrying emission. This migration makes actualizar_propuesta_borrador consistent
-- with that existing intent.
CREATE OR REPLACE FUNCTION actualizar_propuesta_borrador(
  p_propuesta_id BIGINT,
  p_revision_esperada INT,
  p_cotizacion_variante_id INT,
  p_cotizacion_plan_pago_id INT,
  p_draft_json JSONB,
  p_usuario_id INT,
  p_es_admin BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_motivo TEXT;
  v_propuesta propuestas_formales%ROWTYPE;
BEGIN
  SELECT propuestas_formales.* INTO v_propuesta
  FROM propuestas_formales
  WHERE propuestas_formales.id = p_propuesta_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'PF_BORRADOR_NO_ENCONTRADO'; END IF;
  v_motivo := motivo_ineligibilidad_carta_propuesta(
    v_propuesta.carta_oferta_id,
    p_usuario_id,
    p_es_admin
  );
  -- A draft remains editable if its Carta expires or is later replaced/cancelled. PF-2 preserves
  -- the work and reports readiness separately; only identity, product, and ownership are gates here.
  IF v_motivo IN ('CARTA_NO_ENCONTRADA', 'COTIZACION_NO_ENCONTRADA', 'CARTA_SIN_PERMISO', 'PRODUCTO_NO_HABILITADO') THEN
    RAISE EXCEPTION '%', v_motivo;
  END IF;
  IF v_propuesta.estado NOT IN ('borrador', 'error_pdf') THEN RAISE EXCEPTION 'PF_BORRADOR_NO_EDITABLE'; END IF;
  IF v_propuesta.revision <> p_revision_esperada THEN RAISE EXCEPTION 'PF_REVISION_CONFLICT'; END IF;
  IF jsonb_typeof(p_draft_json) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'PF_DRAFT_INVALIDO'; END IF;
  IF (p_cotizacion_variante_id IS NULL) <> (p_cotizacion_plan_pago_id IS NULL) THEN
    RAISE EXCEPTION 'PF_SELECCION_INVALIDA';
  END IF;

  UPDATE propuestas_formales
  SET cotizacion_variante_id = p_cotizacion_variante_id,
      cotizacion_plan_pago_id = p_cotizacion_plan_pago_id,
      draft_json = p_draft_json,
      revision = propuestas_formales.revision + 1,
      actualizada_por = p_usuario_id,
      updated_at = NOW()
  WHERE propuestas_formales.id = p_propuesta_id
  RETURNING propuestas_formales.* INTO v_propuesta;

  RETURN to_jsonb(v_propuesta);
END;
$$;

-- CREATE OR REPLACE preserves the existing ACL from 069/070/074.

COMMIT;
