-- 082_numero_variante_ordinal.sql
-- Hallazgo del QA adversarial de TEST (2026-10-01/05): la numeración visible de las cotizaciones
-- MRC avanzaba de a 2 (593, 595, 597...). Causa: `_insertar_detalle_cotizacion` (migración 052)
-- llamaba a `siguiente_correlativo(p_ramo_id)` por CADA variante para poblar
-- `cotizacion_variantes.numero_variante`, con el mismo contador POR RAMO que usa la cabecera
-- (`numero_cotizacion`). Una cotización de 1 variante consumía 2 números, y cada edición
-- (`actualizar_cotizacion_atomica` borra y reinserta las variantes) quemaba 1 más por variante.
--
-- Desde la migración 042 `numero_variante` solo debe ser único DENTRO de la cotización, y hoy se
-- muestra en el selector de variante de la Propuesta Formal, así que pasa a ser un ordinal por
-- cotización ('1', '2', ...). Se calcula con un contador local dentro del helper: no consume
-- `correlativos`, y como `actualizar_cotizacion_atomica` borra las variantes antes de reinsertar,
-- el ordinal reinicia en '1' en cada edición. `UNIQUE (cotizacion_id, numero_variante)` sigue
-- cumpliéndose por construcción.
--
-- Solo se reemplaza el helper: `crear_cotizacion_atomica` (sigue reservando UN número para la
-- cabecera) y `actualizar_cotizacion_atomica` no cambian, y la firma/atributos del helper se
-- conservan, así que `CREATE OR REPLACE` mantiene sus ACL (ver migraciones 072/074: sin GRANT).
-- `p_ramo_id` queda en la firma aunque ya no se use, para no cambiar la firma de la 052.
--
-- Los datos existentes NO se renumeran: los huecos históricos y los `numero_variante` ya
-- emitidos quedan como están.
CREATE OR REPLACE FUNCTION _insertar_detalle_cotizacion(
  p_cotizacion_id INT,
  p_ramo_id INT,
  p_coberturas JSONB,
  p_variantes JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cobertura JSONB;
  v_variante JSONB;
  v_ajuste JSONB;
  v_plan_pago JSONB;
  v_variante_id INT;
  v_numero_variante INT := 0;
BEGIN
  -- `p_coberturas` es NULL o `[]` para todo ramo que todavía no arma "Detalle del plan"
  -- (hoy solo mrc.calculator.js lo devuelve — ver insertarCoberturasYVariantes en
  -- cotizacion.service.js). `jsonb_typeof` en vez de solo `IS NOT NULL` porque un JSON `null`
  -- literal (distinto de SQL NULL) también puede llegar serializado desde el cliente Supabase.
  IF p_coberturas IS NOT NULL AND jsonb_typeof(p_coberturas) = 'array' THEN
    FOR v_cobertura IN SELECT * FROM jsonb_array_elements(p_coberturas)
    LOOP
      INSERT INTO cotizacion_coberturas (
        cotizacion_id, cobertura_id, nombre_snapshot, texto_legal_snapshot,
        texto_exclusiones_snapshot, monto, franquicia, tipo_aplicacion, incluida
      ) VALUES (
        p_cotizacion_id,
        (v_cobertura->>'cobertura_id')::INT,
        v_cobertura->>'nombre_snapshot',
        v_cobertura->>'texto_legal_snapshot',
        v_cobertura->>'texto_exclusiones_snapshot',
        (v_cobertura->>'monto')::NUMERIC,
        (v_cobertura->>'franquicia')::NUMERIC,
        COALESCE(v_cobertura->>'tipo_aplicacion', 'cobertura'),
        COALESCE((v_cobertura->>'incluida')::BOOLEAN, TRUE)
      );
    END LOOP;
  END IF;

  IF p_variantes IS NOT NULL AND jsonb_typeof(p_variantes) = 'array' THEN
    FOR v_variante IN SELECT * FROM jsonb_array_elements(p_variantes)
    LOOP
      -- Ordinal por cotización ('1', '2', ...): contador local, NO `siguiente_correlativo`, así
      -- crear/editar una cotización no consume números del correlativo del ramo.
      v_numero_variante := v_numero_variante + 1;

      INSERT INTO cotizacion_variantes (
        cotizacion_id, numero_variante, tipo_franquicia, franquicia_monto, prima
      ) VALUES (
        p_cotizacion_id,
        v_numero_variante::TEXT,
        v_variante->>'tipo_franquicia',
        (v_variante->>'franquicia_monto')::NUMERIC,
        (v_variante->>'prima')::NUMERIC
      ) RETURNING id INTO v_variante_id;

      -- Ajustes (descuento/recargo manual del agente, ya topado por el calculador) solo viajan
      -- cuando corresponde — ver total_descuentos/total_recargos en insertarCoberturasYVariantes.
      IF v_variante ? 'ajustes' AND jsonb_typeof(v_variante->'ajustes') = 'array' THEN
        FOR v_ajuste IN SELECT * FROM jsonb_array_elements(v_variante->'ajustes')
        LOOP
          INSERT INTO cotizacion_ajustes (variante_id, tipo, descripcion, monto)
          VALUES (
            v_variante_id,
            v_ajuste->>'tipo',
            v_ajuste->>'descripcion',
            (v_ajuste->>'monto')::NUMERIC
          );
        END LOOP;
      END IF;

      -- Las 4 formas de pago siempre viajan juntas (ver construirVariantes en
      -- cotizacion.service.js) — sin guard adicional, a diferencia de coberturas/ajustes.
      IF v_variante ? 'planes_pago' AND jsonb_typeof(v_variante->'planes_pago') = 'array' THEN
        FOR v_plan_pago IN SELECT * FROM jsonb_array_elements(v_variante->'planes_pago')
        LOOP
          INSERT INTO cotizacion_plan_pago (
            variante_id, forma_pago_id, cantidad_cuotas, rpf_porcentaje,
            rpf_monto, iva_monto, premio_total, monto_inicial, monto_cuota
          ) VALUES (
            v_variante_id,
            (v_plan_pago->>'forma_pago_id')::INT,
            (v_plan_pago->>'cantidad_cuotas')::INT,
            (v_plan_pago->>'rpf_porcentaje')::NUMERIC,
            (v_plan_pago->>'rpf_monto')::NUMERIC,
            (v_plan_pago->>'iva_monto')::NUMERIC,
            (v_plan_pago->>'premio_total')::NUMERIC,
            (v_plan_pago->>'monto_inicial')::NUMERIC,
            (v_plan_pago->>'monto_cuota')::NUMERIC
          );
        END LOOP;
      END IF;
    END LOOP;
  END IF;
END;
$$;
