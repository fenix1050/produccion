BEGIN;

-- Fixes a real bug found live in TEST: a Carta Oferta with an already-emitted
-- Propuesta Formal could still be reopened via ?carta=<id>, filled out to a fresh
-- 100%-ready borrador, and taken all the way to "Emitir" — only to be rejected at
-- the very last step by 073's PF_CARTA_YA_TIENE_PROPUESTA_EMITIDA guard. That guard
-- only runs at emission time (iniciar/confirmar_emision_propuesta_formal); the
-- readiness-time eligibility check used by the carta picker, crear_o_recuperar,
-- obtener and actualizar borrador never knew about a sibling emitida propuesta,
-- so the wizard showed a contradictory "listo para emitir" state.
--
-- 076 fixed the same class of problem for the Historial listing's "Continuar" link
-- (otra_propuesta_emitida). This applies the same EXISTS check one layer earlier, in
-- motivo_ineligibilidad_carta_propuesta itself, so every caller (picker, borrador
-- creation, borrador fetch/update, readiness) is consistent with the emission-time
-- guard from the moment the Carta is loaded — not just at the final RPC call.
CREATE OR REPLACE FUNCTION motivo_ineligibilidad_carta_propuesta(
  p_carta_id BIGINT,
  p_usuario_id INT,
  p_es_admin BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_carta cartas_oferta%ROWTYPE;
  v_cotizacion cotizaciones%ROWTYPE;
BEGIN
  SELECT cartas_oferta.* INTO v_carta
  FROM cartas_oferta
  WHERE cartas_oferta.id = p_carta_id;

  IF NOT FOUND THEN RETURN 'CARTA_NO_ENCONTRADA'; END IF;

  SELECT cotizaciones.* INTO v_cotizacion
  FROM cotizaciones
  WHERE cotizaciones.id = v_carta.cotizacion_id;

  IF NOT FOUND THEN RETURN 'COTIZACION_NO_ENCONTRADA'; END IF;
  IF NOT COALESCE(p_es_admin, FALSE) AND v_cotizacion.agente_id <> p_usuario_id THEN
    RETURN 'CARTA_SIN_PERMISO';
  END IF;
  IF v_carta.producto_codigo <> 'mrc' THEN RETURN 'PRODUCTO_NO_HABILITADO'; END IF;
  IF v_carta.estado <> 'emitida' THEN RETURN 'CARTA_NO_EMITIDA'; END IF;
  IF EXISTS (
    SELECT 1
    FROM propuestas_formales
    WHERE propuestas_formales.carta_oferta_id = p_carta_id
      AND propuestas_formales.estado = 'emitida'
  ) THEN
    RETURN 'PF_CARTA_YA_TIENE_PROPUESTA_EMITIDA';
  END IF;
  IF v_carta.pdf_storage_path IS NULL OR v_carta.pdf_hash IS NULL OR v_carta.snapshot_hash IS NULL THEN
    RETURN 'CARTA_INCOMPLETA';
  END IF;
  IF v_cotizacion.fecha + COALESCE(v_cotizacion.vigencia_dias, 30) < CURRENT_DATE THEN
    RETURN 'CARTA_VENCIDA';
  END IF;
  RETURN NULL;
END;
$$;

-- CREATE OR REPLACE preserves the existing ACL from 069/070 (unlike DROP+CREATE, see 076).

COMMIT;
