-- PF-3 MRC: reserve a Carta Oferta for one issuance before PDF rendering begins.
-- The advisory lock serializes issuance starts for the Carta and the emitted-state
-- guard returns a domain conflict instead of relying on the partial unique index.
CREATE OR REPLACE FUNCTION iniciar_emision_propuesta_formal(
  p_propuesta_id BIGINT,
  p_revision_esperada INT,
  p_snapshot_json JSONB,
  p_snapshot_hash TEXT,
  p_schema_version TEXT,
  p_template_version TEXT,
  p_text_versions_json JSONB,
  p_actor_id INT,
  p_es_admin BOOLEAN
)
RETURNS propuestas_formales
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_propuesta propuestas_formales%ROWTYPE;
  v_motivo TEXT;
  v_numero BIGINT;
BEGIN
  SELECT * INTO v_propuesta FROM propuestas_formales WHERE id = p_propuesta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PF_BORRADOR_NO_ENCONTRADO'; END IF;

  PERFORM pg_advisory_xact_lock(v_propuesta.carta_oferta_id);
  IF EXISTS (
    SELECT 1
    FROM propuestas_formales
    WHERE carta_oferta_id = v_propuesta.carta_oferta_id
      AND estado = 'emitida'
  ) THEN
    RAISE EXCEPTION 'PF_CARTA_YA_TIENE_PROPUESTA_EMITIDA';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM propuestas_formales
    WHERE carta_oferta_id = v_propuesta.carta_oferta_id
      AND id <> v_propuesta.id
      AND estado = 'generando_pdf'
  ) THEN
    RAISE EXCEPTION 'PF_EMISION_EN_PROGRESO';
  END IF;

  v_motivo := motivo_ineligibilidad_carta_propuesta(v_propuesta.carta_oferta_id, p_actor_id, p_es_admin);
  IF v_motivo IS NOT NULL THEN RAISE EXCEPTION '%', v_motivo; END IF;
  IF v_propuesta.estado = 'emitida' THEN RAISE EXCEPTION 'PF_PROPUESTA_YA_EMITIDA'; END IF;
  IF v_propuesta.estado NOT IN ('borrador', 'error_pdf') THEN RAISE EXCEPTION 'PF_EMISION_EN_PROGRESO'; END IF;
  IF v_propuesta.revision <> p_revision_esperada THEN RAISE EXCEPTION 'PF_REVISION_CONFLICT'; END IF;
  IF v_propuesta.cotizacion_variante_id IS NULL OR v_propuesta.cotizacion_plan_pago_id IS NULL THEN
    RAISE EXCEPTION 'PF_SELECCION_INVALIDA';
  END IF;
  IF jsonb_typeof(p_snapshot_json) <> 'object' OR jsonb_typeof(p_text_versions_json) <> 'object' THEN
    RAISE EXCEPTION 'PF_SNAPSHOT_INVALIDO';
  END IF;
  IF v_propuesta.numero_propuesta IS NULL THEN
    INSERT INTO propuesta_correlativos (producto_codigo, ultimo_numero) VALUES ('mrc', 1)
    ON CONFLICT (producto_codigo) DO UPDATE SET ultimo_numero = propuesta_correlativos.ultimo_numero + 1
    RETURNING ultimo_numero INTO v_numero;
  ELSE
    v_numero := v_propuesta.numero_propuesta;
  END IF;
  UPDATE propuestas_formales
  SET estado = 'generando_pdf', numero_propuesta = v_numero,
      reemplaza_propuesta_id = COALESCE(reemplaza_propuesta_id, (
        SELECT id FROM propuestas_formales
        WHERE carta_oferta_id = v_propuesta.carta_oferta_id AND estado = 'anulada'
        ORDER BY anulada_at DESC NULLS LAST, id DESC LIMIT 1
      )),
      snapshot_json = CASE WHEN v_propuesta.estado = 'error_pdf' THEN snapshot_json ELSE p_snapshot_json END,
      snapshot_hash = CASE WHEN v_propuesta.estado = 'error_pdf' THEN snapshot_hash ELSE p_snapshot_hash END,
      schema_version = CASE WHEN v_propuesta.estado = 'error_pdf' THEN schema_version ELSE p_schema_version END,
      template_version = CASE WHEN v_propuesta.estado = 'error_pdf' THEN template_version ELSE p_template_version END,
      text_versions_json = CASE WHEN v_propuesta.estado = 'error_pdf' THEN text_versions_json ELSE p_text_versions_json END,
      ultimo_error_codigo = NULL, ultimo_error_at = NULL,
      updated_at = NOW()
  WHERE id = v_propuesta.id
  RETURNING * INTO v_propuesta;
  INSERT INTO propuesta_formal_eventos (propuesta_formal_id, actor_id, evento, detalle)
  VALUES (v_propuesta.id, p_actor_id, 'emision_iniciada', jsonb_build_object('numero_propuesta', v_numero));
  RETURN v_propuesta;
END;
$$;

CREATE OR REPLACE FUNCTION confirmar_emision_propuesta_formal(
  p_propuesta_id BIGINT,
  p_pdf_storage_path TEXT,
  p_pdf_hash TEXT,
  p_pdf_size INT,
  p_actor_id INT
)
RETURNS propuestas_formales
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_propuesta propuestas_formales%ROWTYPE;
BEGIN
  SELECT * INTO v_propuesta FROM propuestas_formales WHERE id = p_propuesta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PF_BORRADOR_NO_ENCONTRADO'; END IF;
  PERFORM pg_advisory_xact_lock(v_propuesta.carta_oferta_id);
  IF EXISTS (
    SELECT 1
    FROM propuestas_formales
    WHERE carta_oferta_id = v_propuesta.carta_oferta_id
      AND id <> v_propuesta.id
      AND estado = 'emitida'
  ) THEN
    RAISE EXCEPTION 'PF_CARTA_YA_TIENE_PROPUESTA_EMITIDA';
  END IF;
  UPDATE propuestas_formales
  SET estado = 'emitida', pdf_storage_path = p_pdf_storage_path, pdf_hash = p_pdf_hash,
      pdf_size = p_pdf_size, pdf_generado_at = NOW(), emitida_por = p_actor_id,
      emitida_at = NOW(), updated_at = NOW()
  WHERE id = p_propuesta_id AND estado = 'generando_pdf'
  RETURNING * INTO v_propuesta;
  IF NOT FOUND THEN RAISE EXCEPTION 'PF_EMISION_EN_PROGRESO'; END IF;
  INSERT INTO propuesta_formal_eventos (propuesta_formal_id, actor_id, evento, detalle)
  VALUES (v_propuesta.id, p_actor_id, 'emitida', jsonb_build_object('numero_propuesta', v_propuesta.numero_propuesta));
  RETURN v_propuesta;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.iniciar_emision_propuesta_formal(BIGINT, INT, JSONB, TEXT, TEXT, TEXT, JSONB, INT, BOOLEAN) FROM anon;
REVOKE EXECUTE ON FUNCTION public.iniciar_emision_propuesta_formal(BIGINT, INT, JSONB, TEXT, TEXT, TEXT, JSONB, INT, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_emision_propuesta_formal(BIGINT, INT, JSONB, TEXT, TEXT, TEXT, JSONB, INT, BOOLEAN) TO service_role;

REVOKE EXECUTE ON FUNCTION public.confirmar_emision_propuesta_formal(BIGINT, TEXT, TEXT, INT, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.confirmar_emision_propuesta_formal(BIGINT, TEXT, TEXT, INT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_emision_propuesta_formal(BIGINT, TEXT, TEXT, INT, INT) TO service_role;
