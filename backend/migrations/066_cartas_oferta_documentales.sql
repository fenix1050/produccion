-- Historical, immutable Carta Oferta records. A document uses the source quotation
-- number plus its version as its identity; no separate business correlativo is inferred.
CREATE TABLE cartas_oferta (
  id BIGSERIAL PRIMARY KEY,
  cotizacion_id INT NOT NULL REFERENCES cotizaciones(id),
  numero_carta VARCHAR(20) NOT NULL,
  version INT NOT NULL CHECK (version > 0),
  producto_codigo VARCHAR(50) NOT NULL,
  estado VARCHAR(20) NOT NULL CHECK (
    estado IN ('generando', 'emitida', 'error_pdf', 'reemplazada', 'anulada')
  ),
  reemplaza_carta_id BIGINT REFERENCES cartas_oferta(id),
  motivo_reemplazo TEXT,
  motivo_anulacion TEXT,
  snapshot_json JSONB NOT NULL,
  snapshot_hash CHAR(64) NOT NULL,
  schema_version VARCHAR(30) NOT NULL,
  template_version VARCHAR(100) NOT NULL,
  calculator_version VARCHAR(100) NOT NULL,
  pdf_storage_path TEXT,
  pdf_hash CHAR(64),
  pdf_size INT CHECK (pdf_size IS NULL OR pdf_size >= 0),
  pdf_generado_at TIMESTAMPTZ,
  generada_por INT REFERENCES usuarios(id),
  ultimo_error_codigo VARCHAR(100),
  ultimo_error_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cartas_oferta_cotizacion_version_unique UNIQUE (cotizacion_id, version),
  CONSTRAINT cartas_oferta_emitida_completa CHECK (
    estado <> 'emitida' OR (
      pdf_storage_path IS NOT NULL
      AND pdf_hash IS NOT NULL
      AND pdf_size IS NOT NULL
      AND pdf_generado_at IS NOT NULL
    )
  )
);

CREATE INDEX cartas_oferta_cotizacion_estado_idx
  ON cartas_oferta (cotizacion_id, estado, version DESC);

-- The active generation/issued document is idempotent by commercial snapshot. A
-- replaced or cancelled historical version may be reissued as a new version later.
CREATE UNIQUE INDEX cartas_oferta_snapshot_activo_unique
  ON cartas_oferta (cotizacion_id, snapshot_hash)
  WHERE estado IN ('generando', 'error_pdf', 'emitida');

-- The backend is the sole reader/writer through the service-role key. No Storage
-- policy is granted to browser roles, so PDFs are never publicly addressable.
INSERT INTO storage.buckets (id, name, public)
VALUES ('cartas-oferta-privadas', 'cartas-oferta-privadas', FALSE)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.cartas_oferta ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION iniciar_carta_oferta_generacion(
  p_cotizacion_id INT,
  p_producto_codigo TEXT,
  p_snapshot_json JSONB,
  p_snapshot_hash TEXT,
  p_schema_version TEXT,
  p_template_version TEXT,
  p_calculator_version TEXT,
  p_generada_por INT,
  p_cotizacion_fuente JSONB
)
RETURNS TABLE (
  id BIGINT,
  version INT,
  estado TEXT,
  pdf_storage_path TEXT,
  pdf_hash TEXT,
  puede_generar BOOLEAN,
  snapshot_vigente BOOLEAN,
  snapshot_json JSONB
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_carta cartas_oferta%ROWTYPE;
  v_cotizacion cotizaciones%ROWTYPE;
  v_detalle_fuente JSONB;
  v_plan_fuente JSONB;
  v_ramo_fuente JSONB;
  v_usuario_fuente JSONB;
  v_plan_coberturas_fuente JSONB;
  v_numero_carta VARCHAR(20);
  v_version INT;
BEGIN
  -- Serializes document creation with every header/detail invalidation trigger.
  -- Do not take quotation/detail row locks here: a mutation may already own one
  -- before its trigger waits for this advisory lock, which would invert lock order.
  PERFORM pg_advisory_xact_lock(p_cotizacion_id);

  SELECT * INTO v_cotizacion
  FROM cotizaciones
  WHERE id = p_cotizacion_id;

  v_numero_carta := v_cotizacion.numero_cotizacion;

  IF v_numero_carta IS NULL THEN
    RAISE EXCEPTION 'Cotización % no encontrada', p_cotizacion_id;
  END IF;

  SELECT jsonb_build_object(
    'cotizacion_coberturas', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', cc.id,
          'cotizacion_id', cc.cotizacion_id,
          'cobertura_id', cc.cobertura_id,
          'nombre_snapshot', cc.nombre_snapshot,
          'texto_legal_snapshot', cc.texto_legal_snapshot,
          'texto_exclusiones_snapshot', cc.texto_exclusiones_snapshot,
          'monto', cc.monto,
          'franquicia', cc.franquicia,
          'tipo_aplicacion', cc.tipo_aplicacion,
          'incluida', cc.incluida,
          'coberturas_catalogo', CASE
            WHEN catalogo.id IS NULL THEN NULL
            ELSE jsonb_build_object(
              'codigo', catalogo.codigo,
              'incluye_en_suma_asegurada_total', catalogo.incluye_en_suma_asegurada_total
            )
          END
        )
        ORDER BY cc.id
      )
      FROM cotizacion_coberturas AS cc
      LEFT JOIN coberturas_catalogo AS catalogo ON catalogo.id = cc.cobertura_id
      WHERE cc.cotizacion_id = p_cotizacion_id
    ), '[]'::JSONB),
    'cotizacion_servicios', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', cs.id,
          'cotizacion_id', cs.cotizacion_id,
          'servicio_id', cs.servicio_id,
          'nombre_snapshot', cs.nombre_snapshot,
          'texto_legal_snapshot', cs.texto_legal_snapshot,
          'incluido', cs.incluido
        )
        ORDER BY cs.id
      )
      FROM cotizacion_servicios AS cs
      WHERE cs.cotizacion_id = p_cotizacion_id
    ), '[]'::JSONB),
    'cotizacion_clausulas', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ccl.id,
          'cotizacion_id', ccl.cotizacion_id,
          'clausula_id', ccl.clausula_id,
          'texto_legal_snapshot', ccl.texto_legal_snapshot
        )
        ORDER BY ccl.id
      )
      FROM cotizacion_clausulas AS ccl
      WHERE ccl.cotizacion_id = p_cotizacion_id
    ), '[]'::JSONB),
    'cotizacion_variantes', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', cv.id,
          'cotizacion_id', cv.cotizacion_id,
          'numero_variante', cv.numero_variante,
          'tipo_franquicia', cv.tipo_franquicia,
          'franquicia_monto', cv.franquicia_monto,
          'prima', cv.prima,
          'cotizacion_plan_pago', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', cpp.id,
                'variante_id', cpp.variante_id,
                'forma_pago_id', cpp.forma_pago_id,
                'cantidad_cuotas', cpp.cantidad_cuotas,
                'rpf_porcentaje', cpp.rpf_porcentaje,
                'rpf_monto', cpp.rpf_monto,
                'iva_monto', cpp.iva_monto,
                'premio_total', cpp.premio_total,
                'monto_inicial', cpp.monto_inicial,
                'monto_cuota', cpp.monto_cuota,
                'formas_pago', CASE
                  WHEN fp.id IS NULL THEN NULL
                  ELSE jsonb_build_object(
                    'codigo', fp.codigo,
                    'nombre_display', fp.nombre_display
                  )
                END
              )
              ORDER BY cpp.id
            )
            FROM cotizacion_plan_pago AS cpp
            LEFT JOIN formas_pago AS fp ON fp.id = cpp.forma_pago_id
            WHERE cpp.variante_id = cv.id
          ), '[]'::JSONB),
          'cotizacion_ajustes', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', ca.id,
                'variante_id', ca.variante_id,
                'tipo', ca.tipo,
                'catalogo_id', ca.catalogo_id,
                'descripcion', ca.descripcion,
                'porcentaje', ca.porcentaje,
                'monto', ca.monto
              )
              ORDER BY ca.id
            )
            FROM cotizacion_ajustes AS ca
            WHERE ca.variante_id = cv.id
          ), '[]'::JSONB)
        )
        ORDER BY cv.id
      )
      FROM cotizacion_variantes AS cv
      WHERE cv.cotizacion_id = p_cotizacion_id
    ), '[]'::JSONB)
  ) INTO v_detalle_fuente;

  SELECT jsonb_build_object('id', p.id, 'nombre', p.nombre)
  INTO v_plan_fuente
  FROM planes AS p
  WHERE p.id = v_cotizacion.plan_id;

  SELECT jsonb_build_object(
    'id', r.id,
    'nombre', r.nombre,
    'nombre_display', r.nombre_display,
    'calculador', r.calculador
  ) INTO v_ramo_fuente
  FROM ramos AS r
  WHERE r.id = v_cotizacion.ramo_id;

  SELECT jsonb_build_object(
    'nombre', u.nombre,
    'email', u.email,
    'telefono', u.telefono,
    'roles', CASE WHEN rol.id IS NULL THEN NULL ELSE jsonb_build_object('nombre', rol.nombre) END
  ) INTO v_usuario_fuente
  FROM usuarios AS u
  LEFT JOIN roles AS rol ON rol.id = u.rol_id
  WHERE u.id = v_cotizacion.agente_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', pc.id,
      'plan_id', pc.plan_id,
      'cobertura_id', pc.cobertura_id,
      'monto', pc.monto,
      'incluida_por_defecto', pc.incluida_por_defecto,
      'coberturas_catalogo', CASE
        WHEN catalogo.id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'codigo', catalogo.codigo,
          'incluye_en_suma_asegurada_total', catalogo.incluye_en_suma_asegurada_total
        )
      END
    )
    ORDER BY pc.id
  ), '[]'::JSONB) INTO v_plan_coberturas_fuente
  FROM plan_coberturas AS pc
  LEFT JOIN coberturas_catalogo AS catalogo ON catalogo.id = pc.cobertura_id
  WHERE pc.plan_id = v_cotizacion.plan_id;

  -- The source data was read before this RPC. Once the quotation row is locked,
  -- reject that snapshot if a recotization committed before the lock was acquired.
  -- If it commits later, its trigger can still mark this newly-created Carta as
  -- replaced before it is emitted.
  IF (p_cotizacion_fuente->>'plan_id')::INT IS DISTINCT FROM v_cotizacion.plan_id
    OR (p_cotizacion_fuente->>'agente_id')::INT IS DISTINCT FROM v_cotizacion.agente_id
    OR (p_cotizacion_fuente->>'fecha')::DATE IS DISTINCT FROM v_cotizacion.fecha
    OR (p_cotizacion_fuente->>'vigencia_dias')::INT IS DISTINCT FROM v_cotizacion.vigencia_dias
    OR p_cotizacion_fuente->>'cliente_nombre' IS DISTINCT FROM v_cotizacion.cliente_nombre
    OR p_cotizacion_fuente->>'cliente_contacto' IS DISTINCT FROM v_cotizacion.cliente_contacto
    OR p_cotizacion_fuente->'riesgo_datos' IS DISTINCT FROM v_cotizacion.riesgo_datos
    OR (p_cotizacion_fuente->>'capital_asegurado')::NUMERIC IS DISTINCT FROM v_cotizacion.capital_asegurado
    OR p_cotizacion_fuente->>'moneda' IS DISTINCT FROM v_cotizacion.moneda
    OR (p_cotizacion_fuente->>'tipo_cambio_snapshot')::NUMERIC IS DISTINCT FROM v_cotizacion.tipo_cambio_snapshot
    OR p_cotizacion_fuente->>'tipo_cambio_fuente' IS DISTINCT FROM v_cotizacion.tipo_cambio_fuente
    OR (p_cotizacion_fuente->>'tipo_cambio_fecha')::TIMESTAMPTZ IS DISTINCT FROM v_cotizacion.tipo_cambio_fecha
    OR p_cotizacion_fuente->'usuario' IS DISTINCT FROM v_usuario_fuente
    OR p_cotizacion_fuente->'plan' IS DISTINCT FROM v_plan_fuente
    OR p_cotizacion_fuente->'ramo' IS DISTINCT FROM v_ramo_fuente
    OR p_cotizacion_fuente->'plan_coberturas' IS DISTINCT FROM v_plan_coberturas_fuente
    OR p_cotizacion_fuente->'cotizacion_coberturas' IS DISTINCT FROM v_detalle_fuente->'cotizacion_coberturas'
    OR p_cotizacion_fuente->'cotizacion_servicios' IS DISTINCT FROM v_detalle_fuente->'cotizacion_servicios'
    OR p_cotizacion_fuente->'cotizacion_clausulas' IS DISTINCT FROM v_detalle_fuente->'cotizacion_clausulas'
    OR p_cotizacion_fuente->'cotizacion_variantes' IS DISTINCT FROM v_detalle_fuente->'cotizacion_variantes' THEN
    RETURN QUERY SELECT NULL::BIGINT, NULL::INT, NULL::TEXT, NULL::TEXT, NULL::TEXT, FALSE, FALSE, NULL::JSONB;
    RETURN;
  END IF;

  SELECT * INTO v_carta
  FROM cartas_oferta
  WHERE cotizacion_id = p_cotizacion_id
    AND snapshot_hash = p_snapshot_hash
    AND estado IN ('generando', 'error_pdf', 'emitida');

  IF FOUND THEN
    IF v_carta.estado = 'error_pdf' THEN
      UPDATE cartas_oferta
      SET estado = 'generando',
          ultimo_error_codigo = NULL,
          ultimo_error_at = NULL,
          updated_at = NOW()
      WHERE cartas_oferta.id = v_carta.id;

      RETURN QUERY SELECT v_carta.id, v_carta.version, 'generando'::TEXT, NULL::TEXT, NULL::TEXT, TRUE, TRUE, v_carta.snapshot_json;
    ELSE
      RETURN QUERY SELECT v_carta.id, v_carta.version, v_carta.estado::TEXT, v_carta.pdf_storage_path, v_carta.pdf_hash, FALSE, TRUE, v_carta.snapshot_json;
    END IF;
    RETURN;
  END IF;

  SELECT COALESCE(MAX(cartas_oferta.version), 0) + 1 INTO v_version
  FROM cartas_oferta
  WHERE cotizacion_id = p_cotizacion_id;

  INSERT INTO cartas_oferta (
    cotizacion_id, numero_carta, version, producto_codigo, estado,
    reemplaza_carta_id, snapshot_json, snapshot_hash, schema_version,
    template_version, calculator_version, generada_por
  ) VALUES (
    p_cotizacion_id, v_numero_carta, v_version, p_producto_codigo, 'generando',
    (
      SELECT cartas_oferta.id
      FROM cartas_oferta
      WHERE cotizacion_id = p_cotizacion_id
        AND estado = 'reemplazada'
      ORDER BY version DESC
      LIMIT 1
    ),
    p_snapshot_json, p_snapshot_hash, p_schema_version,
    p_template_version, p_calculator_version, p_generada_por
  ) RETURNING cartas_oferta.id, cartas_oferta.snapshot_json INTO v_carta.id, v_carta.snapshot_json;

  RETURN QUERY SELECT v_carta.id, v_version, 'generando'::TEXT, NULL::TEXT, NULL::TEXT, TRUE, TRUE, v_carta.snapshot_json;
END;
$$;

CREATE OR REPLACE FUNCTION emitir_carta_oferta(
  p_carta_id BIGINT,
  p_pdf_storage_path TEXT,
  p_pdf_hash TEXT,
  p_pdf_size INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE cartas_oferta
  SET estado = 'emitida',
      pdf_storage_path = p_pdf_storage_path,
      pdf_hash = p_pdf_hash,
      pdf_size = p_pdf_size,
      pdf_generado_at = NOW(),
      updated_at = NOW()
  WHERE id = p_carta_id
    AND estado = 'generando';

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION registrar_error_carta_oferta(
  p_carta_id BIGINT,
  p_error_codigo TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE cartas_oferta
  SET estado = 'error_pdf',
      ultimo_error_codigo = LEFT(COALESCE(p_error_codigo, 'pdf_generation_failed'), 100),
      ultimo_error_at = NOW(),
      updated_at = NOW()
  WHERE id = p_carta_id
    AND estado = 'generando';
END;
$$;

CREATE OR REPLACE FUNCTION proteger_snapshot_carta_oferta()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.snapshot_json IS DISTINCT FROM NEW.snapshot_json
    OR OLD.snapshot_hash IS DISTINCT FROM NEW.snapshot_hash
    OR OLD.schema_version IS DISTINCT FROM NEW.schema_version
    OR OLD.template_version IS DISTINCT FROM NEW.template_version
    OR OLD.calculator_version IS DISTINCT FROM NEW.calculator_version
    OR (OLD.pdf_storage_path IS NOT NULL AND OLD.pdf_storage_path IS DISTINCT FROM NEW.pdf_storage_path)
    OR (OLD.pdf_hash IS NOT NULL AND OLD.pdf_hash IS DISTINCT FROM NEW.pdf_hash)
    OR (OLD.pdf_size IS NOT NULL AND OLD.pdf_size IS DISTINCT FROM NEW.pdf_size)
    OR (OLD.pdf_generado_at IS NOT NULL AND OLD.pdf_generado_at IS DISTINCT FROM NEW.pdf_generado_at) THEN
    RAISE EXCEPTION 'Los snapshots y artefactos de Carta Oferta son inmutables';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cartas_oferta_proteger_snapshot
BEFORE UPDATE ON cartas_oferta
FOR EACH ROW EXECUTE FUNCTION proteger_snapshot_carta_oferta();

CREATE OR REPLACE FUNCTION invalidar_cartas_oferta_por_cambio_comercial(
  p_cotizacion_id INT,
  p_motivo TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Must match iniciar_carta_oferta_generacion: prevents a detail-only INSERT
  -- from passing between that function's source check and Carta creation.
  PERFORM pg_advisory_xact_lock(p_cotizacion_id);

  UPDATE cartas_oferta
  SET estado = 'reemplazada',
      motivo_reemplazo = p_motivo,
      updated_at = NOW()
  WHERE cotizacion_id = p_cotizacion_id
    AND estado IN ('generando', 'error_pdf', 'emitida');
END;
$$;

CREATE OR REPLACE FUNCTION invalidar_cartas_oferta_por_cambios_comerciales(
  p_cotizacion_ids INT[],
  p_motivo TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cotizacion_id INT;
BEGIN
  -- Every caller acquires per-quotation advisory locks in ascending order. This
  -- avoids an A→B / B→A reparenting pair deadlocking while preserving both sides.
  FOR v_cotizacion_id IN
    SELECT DISTINCT cotizacion_id
    FROM unnest(COALESCE(p_cotizacion_ids, ARRAY[]::INT[])) AS ids(cotizacion_id)
    WHERE cotizacion_id IS NOT NULL
    ORDER BY cotizacion_id
  LOOP
    PERFORM invalidar_cartas_oferta_por_cambio_comercial(v_cotizacion_id, p_motivo);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION reemplazar_cartas_por_recotizacion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.plan_id IS DISTINCT FROM NEW.plan_id
    OR OLD.agente_id IS DISTINCT FROM NEW.agente_id
    OR OLD.fecha IS DISTINCT FROM NEW.fecha
    OR OLD.vigencia_dias IS DISTINCT FROM NEW.vigencia_dias
    OR OLD.cliente_nombre IS DISTINCT FROM NEW.cliente_nombre
    OR OLD.cliente_contacto IS DISTINCT FROM NEW.cliente_contacto
    OR OLD.riesgo_datos IS DISTINCT FROM NEW.riesgo_datos
    OR OLD.capital_asegurado IS DISTINCT FROM NEW.capital_asegurado
    OR OLD.moneda IS DISTINCT FROM NEW.moneda
    OR OLD.tipo_cambio_snapshot IS DISTINCT FROM NEW.tipo_cambio_snapshot
    OR OLD.tipo_cambio_fuente IS DISTINCT FROM NEW.tipo_cambio_fuente
    OR OLD.tipo_cambio_fecha IS DISTINCT FROM NEW.tipo_cambio_fecha THEN
    PERFORM invalidar_cartas_oferta_por_cambio_comercial(
      NEW.id,
      'Commercial requote changed the source quotation'
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION reemplazar_cartas_por_cambio_detalle_cotizacion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_cotizacion_ids INT[] := ARRAY[]::INT[];
  v_variante_ids INT[] := ARRAY[]::INT[];
BEGIN
  IF TG_TABLE_NAME IN (
    'cotizacion_coberturas',
    'cotizacion_servicios',
    'cotizacion_clausulas',
    'cotizacion_variantes'
  ) THEN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_cotizacion_ids := array_append(v_cotizacion_ids, OLD.cotizacion_id);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      v_cotizacion_ids := array_append(v_cotizacion_ids, NEW.cotizacion_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'cotizacion_plan_pago' THEN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_variante_ids := array_append(v_variante_ids, OLD.variante_id);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      v_variante_ids := array_append(v_variante_ids, NEW.variante_id);
    END IF;
    SELECT ARRAY_AGG(cotizacion_id) INTO v_cotizacion_ids
    FROM cotizacion_variantes
    WHERE id = ANY(v_variante_ids);
  ELSIF TG_TABLE_NAME = 'cotizacion_ajustes' THEN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_variante_ids := array_append(v_variante_ids, OLD.variante_id);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      v_variante_ids := array_append(v_variante_ids, NEW.variante_id);
    END IF;
    SELECT ARRAY_AGG(cotizacion_id) INTO v_cotizacion_ids
    FROM cotizacion_variantes
    WHERE id = ANY(v_variante_ids);
  END IF;

  PERFORM invalidar_cartas_oferta_por_cambios_comerciales(
    v_cotizacion_ids,
    'Commercial requote changed persisted quotation details'
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- Catalog and agent-profile rows are render dependencies, not merely lookup data. They use the
-- same ordered quotation advisory locks as detail mutations, so a committed change after source
-- validation but before PDF emission replaces the generating Carta instead of racing it.
CREATE OR REPLACE FUNCTION reemplazar_cartas_por_cambio_dependencia_render()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ids_dependencia INT[] := ARRAY[]::INT[];
  v_cotizacion_ids INT[];
BEGIN
  IF TG_TABLE_NAME = 'formas_pago' THEN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_ids_dependencia := array_append(v_ids_dependencia, OLD.id);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      v_ids_dependencia := array_append(v_ids_dependencia, NEW.id);
    END IF;
    SELECT ARRAY_AGG(DISTINCT cv.cotizacion_id) INTO v_cotizacion_ids
    FROM cotizacion_plan_pago AS cpp
    JOIN cotizacion_variantes AS cv ON cv.id = cpp.variante_id
    WHERE cpp.forma_pago_id = ANY(v_ids_dependencia);
  ELSIF TG_TABLE_NAME = 'planes' THEN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_ids_dependencia := array_append(v_ids_dependencia, OLD.id);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      v_ids_dependencia := array_append(v_ids_dependencia, NEW.id);
    END IF;
    SELECT ARRAY_AGG(DISTINCT id) INTO v_cotizacion_ids
    FROM cotizaciones
    WHERE plan_id = ANY(v_ids_dependencia);
  ELSIF TG_TABLE_NAME = 'ramos' THEN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_ids_dependencia := array_append(v_ids_dependencia, OLD.id);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      v_ids_dependencia := array_append(v_ids_dependencia, NEW.id);
    END IF;
    SELECT ARRAY_AGG(DISTINCT id) INTO v_cotizacion_ids
    FROM cotizaciones
    WHERE ramo_id = ANY(v_ids_dependencia);
  ELSIF TG_TABLE_NAME = 'plan_coberturas' THEN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_ids_dependencia := array_append(v_ids_dependencia, OLD.plan_id);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      v_ids_dependencia := array_append(v_ids_dependencia, NEW.plan_id);
    END IF;
    SELECT ARRAY_AGG(DISTINCT id) INTO v_cotizacion_ids
    FROM cotizaciones
    WHERE plan_id = ANY(v_ids_dependencia);
  ELSIF TG_TABLE_NAME = 'coberturas_catalogo' THEN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_ids_dependencia := array_append(v_ids_dependencia, OLD.id);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      v_ids_dependencia := array_append(v_ids_dependencia, NEW.id);
    END IF;
    SELECT ARRAY_AGG(DISTINCT cotizacion_id) INTO v_cotizacion_ids
    FROM (
      SELECT cc.cotizacion_id
      FROM cotizacion_coberturas AS cc
      WHERE cc.cobertura_id = ANY(v_ids_dependencia)
      UNION
      SELECT c.id
      FROM plan_coberturas AS pc
      JOIN cotizaciones AS c ON c.plan_id = pc.plan_id
      WHERE pc.cobertura_id = ANY(v_ids_dependencia)
    ) AS cotizaciones_afectadas;
  ELSIF TG_TABLE_NAME = 'usuarios' THEN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_ids_dependencia := array_append(v_ids_dependencia, OLD.id);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      v_ids_dependencia := array_append(v_ids_dependencia, NEW.id);
    END IF;
    SELECT ARRAY_AGG(DISTINCT id) INTO v_cotizacion_ids
    FROM cotizaciones
    WHERE agente_id = ANY(v_ids_dependencia);
  ELSIF TG_TABLE_NAME = 'roles' THEN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      v_ids_dependencia := array_append(v_ids_dependencia, OLD.id);
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
      v_ids_dependencia := array_append(v_ids_dependencia, NEW.id);
    END IF;
    SELECT ARRAY_AGG(DISTINCT c.id) INTO v_cotizacion_ids
    FROM cotizaciones AS c
    JOIN usuarios AS u ON u.id = c.agente_id
    WHERE u.rol_id = ANY(v_ids_dependencia);
  END IF;

  PERFORM invalidar_cartas_oferta_por_cambios_comerciales(
    v_cotizacion_ids,
    'Carta Oferta render dependency changed'
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cotizaciones_reemplazar_cartas_por_recotizacion
AFTER UPDATE ON cotizaciones
FOR EACH ROW EXECUTE FUNCTION reemplazar_cartas_por_recotizacion();

CREATE TRIGGER cotizacion_coberturas_reemplazar_cartas_por_cambio
BEFORE INSERT OR UPDATE OR DELETE ON cotizacion_coberturas
FOR EACH ROW EXECUTE FUNCTION reemplazar_cartas_por_cambio_detalle_cotizacion();

CREATE TRIGGER cotizacion_servicios_reemplazar_cartas_por_cambio
BEFORE INSERT OR UPDATE OR DELETE ON cotizacion_servicios
FOR EACH ROW EXECUTE FUNCTION reemplazar_cartas_por_cambio_detalle_cotizacion();

CREATE TRIGGER cotizacion_clausulas_reemplazar_cartas_por_cambio
BEFORE INSERT OR UPDATE OR DELETE ON cotizacion_clausulas
FOR EACH ROW EXECUTE FUNCTION reemplazar_cartas_por_cambio_detalle_cotizacion();

CREATE TRIGGER cotizacion_variantes_reemplazar_cartas_por_cambio
BEFORE INSERT OR UPDATE OR DELETE ON cotizacion_variantes
FOR EACH ROW EXECUTE FUNCTION reemplazar_cartas_por_cambio_detalle_cotizacion();

CREATE TRIGGER cotizacion_plan_pago_reemplazar_cartas_por_cambio
BEFORE INSERT OR UPDATE OR DELETE ON cotizacion_plan_pago
FOR EACH ROW EXECUTE FUNCTION reemplazar_cartas_por_cambio_detalle_cotizacion();

CREATE TRIGGER cotizacion_ajustes_reemplazar_cartas_por_cambio
BEFORE INSERT OR UPDATE OR DELETE ON cotizacion_ajustes
FOR EACH ROW EXECUTE FUNCTION reemplazar_cartas_por_cambio_detalle_cotizacion();

CREATE TRIGGER formas_pago_reemplazar_cartas_por_cambio_render
AFTER UPDATE OF codigo, nombre_display ON formas_pago
FOR EACH ROW EXECUTE FUNCTION reemplazar_cartas_por_cambio_dependencia_render();

CREATE TRIGGER planes_reemplazar_cartas_por_cambio_render
AFTER UPDATE OF nombre ON planes
FOR EACH ROW EXECUTE FUNCTION reemplazar_cartas_por_cambio_dependencia_render();

CREATE TRIGGER ramos_reemplazar_cartas_por_cambio_render
AFTER UPDATE OF nombre, nombre_display, calculador ON ramos
FOR EACH ROW EXECUTE FUNCTION reemplazar_cartas_por_cambio_dependencia_render();

CREATE TRIGGER plan_coberturas_reemplazar_cartas_por_cambio_render
BEFORE INSERT OR UPDATE OR DELETE ON plan_coberturas
FOR EACH ROW EXECUTE FUNCTION reemplazar_cartas_por_cambio_dependencia_render();

CREATE TRIGGER coberturas_catalogo_reemplazar_cartas_por_cambio_render
AFTER UPDATE OF codigo, incluye_en_suma_asegurada_total ON coberturas_catalogo
FOR EACH ROW EXECUTE FUNCTION reemplazar_cartas_por_cambio_dependencia_render();

CREATE TRIGGER usuarios_reemplazar_cartas_por_cambio_render
AFTER UPDATE OF nombre, email, telefono, rol_id ON usuarios
FOR EACH ROW EXECUTE FUNCTION reemplazar_cartas_por_cambio_dependencia_render();

CREATE TRIGGER roles_reemplazar_cartas_por_cambio_render
AFTER UPDATE OF nombre ON roles
FOR EACH ROW EXECUTE FUNCTION reemplazar_cartas_por_cambio_dependencia_render();

REVOKE EXECUTE ON FUNCTION iniciar_carta_oferta_generacion(INT, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, INT, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION emitir_carta_oferta(BIGINT, TEXT, TEXT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION registrar_error_carta_oferta(BIGINT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION invalidar_cartas_oferta_por_cambio_comercial(INT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION invalidar_cartas_oferta_por_cambios_comerciales(INT[], TEXT) FROM PUBLIC;
