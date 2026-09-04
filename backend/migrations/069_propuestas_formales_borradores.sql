-- PF-2: persistent Propuesta Formal drafts for eligible MRC Carta Oferta records.
-- PF-3 emission artifacts, numbering, snapshots, signatures, and PDF generation are intentionally absent.
CREATE TABLE propuestas_formales (
  id BIGSERIAL PRIMARY KEY,
  carta_oferta_id BIGINT NOT NULL REFERENCES cartas_oferta(id),
  estado VARCHAR(20) NOT NULL DEFAULT 'borrador' CHECK (
    estado IN ('borrador', 'en_revision', 'generando_pdf', 'emitida', 'error_pdf', 'reemplazada', 'anulada')
  ),
  revision INT NOT NULL DEFAULT 1 CHECK (revision > 0),
  cotizacion_variante_id INT REFERENCES cotizacion_variantes(id) ON DELETE SET NULL,
  cotizacion_plan_pago_id INT REFERENCES cotizacion_plan_pago(id) ON DELETE SET NULL,
  draft_json JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (
    jsonb_typeof(draft_json) = 'object' AND pg_column_size(draft_json) <= 262144
  ),
  creada_por INT NOT NULL REFERENCES usuarios(id),
  actualizada_por INT NOT NULL REFERENCES usuarios(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX propuestas_formales_carta_estado_idx
  ON propuestas_formales (carta_oferta_id, estado, updated_at DESC);

CREATE INDEX propuestas_formales_creada_por_idx
  ON propuestas_formales (creada_por, updated_at DESC);

CREATE UNIQUE INDEX propuestas_formales_borrador_activo_unique
  ON propuestas_formales (carta_oferta_id)
  WHERE estado IN ('borrador', 'en_revision', 'generando_pdf', 'error_pdf');

ALTER TABLE public.propuestas_formales ENABLE ROW LEVEL SECURITY;

-- Returns NULL only when the Carta is currently eligible for PF-2. The backend uses the
-- service-role connection, but authorization remains explicit and is repeated inside mutations.
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
  IF v_carta.pdf_storage_path IS NULL OR v_carta.pdf_hash IS NULL OR v_carta.snapshot_hash IS NULL THEN
    RETURN 'CARTA_INCOMPLETA';
  END IF;
  IF v_cotizacion.fecha + COALESCE(v_cotizacion.vigencia_dias, 30) < CURRENT_DATE THEN
    RETURN 'CARTA_VENCIDA';
  END IF;
  RETURN NULL;
END;
$$;

-- The same selection guard applies even if a privileged database client bypasses the RPC.
CREATE OR REPLACE FUNCTION validar_seleccion_propuesta_formal()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_cotizacion_carta_id INT;
  v_cotizacion_variante_id INT;
  v_variante_plan_pago_id INT;
BEGIN
  -- PostgreSQL may execute the two ON DELETE SET NULL actions in separate internal updates.
  -- Readiness treats either missing reference as an incomplete selection; the public mutation RPC
  -- below still rejects callers that attempt to persist only one side deliberately.
  IF NEW.cotizacion_variante_id IS NULL OR NEW.cotizacion_plan_pago_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT cartas_oferta.cotizacion_id INTO v_cotizacion_carta_id
  FROM cartas_oferta
  WHERE cartas_oferta.id = NEW.carta_oferta_id;

  SELECT cotizacion_variantes.cotizacion_id INTO v_cotizacion_variante_id
  FROM cotizacion_variantes
  WHERE cotizacion_variantes.id = NEW.cotizacion_variante_id;

  SELECT cotizacion_plan_pago.variante_id INTO v_variante_plan_pago_id
  FROM cotizacion_plan_pago
  WHERE cotizacion_plan_pago.id = NEW.cotizacion_plan_pago_id;

  IF v_cotizacion_carta_id IS NULL
    OR v_cotizacion_variante_id IS DISTINCT FROM v_cotizacion_carta_id
    OR v_variante_plan_pago_id IS DISTINCT FROM NEW.cotizacion_variante_id THEN
    RAISE EXCEPTION 'PF_SELECCION_INVALIDA';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER propuestas_formales_validar_seleccion
BEFORE INSERT OR UPDATE OF carta_oferta_id, cotizacion_variante_id, cotizacion_plan_pago_id
ON propuestas_formales
FOR EACH ROW EXECUTE FUNCTION validar_seleccion_propuesta_formal();

CREATE OR REPLACE FUNCTION listar_cartas_oferta_aptas_propuesta(
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
  propuesta_revision INT
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
    pf.revision
  FROM cartas_oferta AS ca
  JOIN cotizaciones AS c ON c.id = ca.cotizacion_id
  LEFT JOIN propuestas_formales AS pf
    ON pf.carta_oferta_id = ca.id
   AND pf.estado IN ('borrador', 'en_revision', 'generando_pdf', 'error_pdf')
  WHERE motivo_ineligibilidad_carta_propuesta(ca.id, p_usuario_id, p_es_admin) IS NULL
    AND (
      NULLIF(BTRIM(COALESCE(p_busqueda, '')), '') IS NULL
      OR ca.numero_carta ILIKE '%' || BTRIM(p_busqueda) || '%'
      OR c.cliente_nombre ILIKE '%' || BTRIM(p_busqueda) || '%'
    )
  ORDER BY ca.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limite, 50), 1), 100);
$$;

CREATE OR REPLACE FUNCTION crear_o_recuperar_propuesta_borrador(
  p_carta_id BIGINT,
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
  PERFORM pg_advisory_xact_lock(p_carta_id);
  v_motivo := motivo_ineligibilidad_carta_propuesta(p_carta_id, p_usuario_id, p_es_admin);
  IF v_motivo IS NOT NULL THEN RAISE EXCEPTION '%', v_motivo; END IF;

  SELECT propuestas_formales.* INTO v_propuesta
  FROM propuestas_formales
  WHERE propuestas_formales.carta_oferta_id = p_carta_id
    AND propuestas_formales.estado IN ('borrador', 'en_revision', 'generando_pdf', 'error_pdf')
  FOR UPDATE;

  IF FOUND THEN
    RETURN to_jsonb(v_propuesta) || jsonb_build_object('creado', FALSE);
  END IF;

  INSERT INTO propuestas_formales (carta_oferta_id, creada_por, actualizada_por)
  VALUES (p_carta_id, p_usuario_id, p_usuario_id)
  RETURNING propuestas_formales.* INTO v_propuesta;

  RETURN to_jsonb(v_propuesta) || jsonb_build_object('creado', TRUE);
END;
$$;

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
  IF v_propuesta.estado <> 'borrador' THEN RAISE EXCEPTION 'PF_BORRADOR_NO_EDITABLE'; END IF;
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

REVOKE EXECUTE ON FUNCTION motivo_ineligibilidad_carta_propuesta(BIGINT, INT, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION listar_cartas_oferta_aptas_propuesta(INT, BOOLEAN, TEXT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION crear_o_recuperar_propuesta_borrador(BIGINT, INT, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION actualizar_propuesta_borrador(BIGINT, INT, INT, INT, JSONB, INT, BOOLEAN) FROM PUBLIC;
