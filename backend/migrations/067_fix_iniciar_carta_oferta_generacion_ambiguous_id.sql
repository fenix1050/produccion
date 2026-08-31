-- Keep the existing function signature, security context, and EXECUTE privileges unchanged.
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
  WHERE cotizaciones.id = p_cotizacion_id;

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
