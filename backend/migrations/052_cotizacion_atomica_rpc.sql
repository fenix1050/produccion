-- 052_cotizacion_atomica_rpc.sql
-- Cambio SDD `cotizacion-transaccional` (issue #87 finding A1). Reemplaza el patrón actual de
-- crearCotizacion/actualizarCotizacion en cotizacion.service.js — varios INSERT/UPDATE/DELETE
-- secuenciales vía el cliente PostgREST de Supabase, sin transacción real, compensados a mano
-- con un DELETE de la cabecera si algo falla a mitad de camino (crearCotizacion) o con un orden
-- "insertar antes de borrar" (actualizarCotizacion) — ninguno de los dos evita un correlativo
-- quemado ni un estado intermedio si la falla ocurre en el paso equivocado.
--
-- Estas 2 funciones (+ 1 helper privado compartido) corren todo su cuerpo en la transacción
-- implícita de una sola llamada `supabase.rpc()`, así que un error en cualquier INSERT hace
-- rollback de TODO lo anterior en la misma función — incluido el incremento de
-- `correlativos.ultimo_numero` (ver `siguiente_correlativo`, migración 009): no hay `BEGIN …
-- EXCEPTION` en ningún lado de este archivo a propósito, porque un handler de excepción abre un
-- subtransacción/savepoint implícito y dejaría sobrevivir el incremento del correlativo aunque el
-- resto de la función fallara — exactamente el bug que este cambio corrige. Los errores se dejan
-- propagar tal cual (mismo criterio que ya usa `siguiente_correlativo`).
--
-- Esta migración es puramente aditiva: no la usa ningún código todavía (llega en una PR
-- posterior de esta misma cadena). Reversible con `DROP FUNCTION` sin tocar datos.

-- Helper privado: inserta coberturas + variantes/ajustes/plan de pago de una cotización YA
-- persistida (cabecera insertada por crear_cotizacion_atomica, o ya existente y recién
-- actualizada por actualizar_cotizacion_atomica). Compartido entre ambas para no duplicar esta
-- lógica — al ser una llamada plpgsql anidada (no una función `autónoma`), corre dentro de la
-- MISMA transacción que la función que la invoca.
--
-- Whitelist explícita de columnas en cada INSERT (no `jsonb_populate_record`): el JSONB de
-- entrada llega armado en JS a partir de datos YA calculados/resueltos server-side
-- (cotizacion.service.js), pero una función expuesta por PostgREST no puede confiar en que el
-- shape del payload sea exactamente el esperado — `jsonb_populate_record` dejaría que un payload
-- malformado (o un futuro caller) setee columnas que no le corresponden. Acá no hay ninguna
-- columna "peligrosa" (agente_id/ramo_id no viven en estas tablas), pero se mantiene el mismo
-- criterio en todo el archivo por consistencia con crear_cotizacion_atomica/
-- actualizar_cotizacion_atomica, donde sí importa.
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
  v_numero_variante INT;
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
      -- Correlativo por variante (numero_variante), mismo contador POR RAMO que la cabecera
      -- (migración 042: único DENTRO de la cotización, no global) — reusa siguiente_correlativo
      -- en vez de inlinear el UPDATE ... RETURNING, así hay una sola definición de la semántica
      -- del contador y esta llamada anidada participa de la misma transacción (Postgres no tiene
      -- transacciones autónomas: el incremento de acá hace rollback junto con todo lo demás si
      -- esta función o su caller fallan más adelante).
      v_numero_variante := siguiente_correlativo(p_ramo_id);

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

-- Alta atómica: reserva el correlativo de la cabecera, inserta `cotizaciones` y delega el resto
-- al helper de arriba, todo en una sola transacción. `p_prefijo_numero` llega ya resuelto por JS
-- (`ramo.nombre.toUpperCase()`, ver crearCotizacion) — la función solo concatena el correlativo
-- numérico, no decide el prefijo (eso es dato de catálogo, no de negocio transaccional).
--
-- `tipo_cambio_snapshot`/`_fuente`/`_fecha` quedan NULL cuando las claves NO vienen en
-- `p_cotizacion` (mismo criterio que hoy: `calcularPreview` nunca llega acá, y crearCotizacion
-- solo arma esas claves cuando `variantesCalculadas.tipoCambioUsado` no es null — migración 034).
CREATE OR REPLACE FUNCTION crear_cotizacion_atomica(
  p_prefijo_numero TEXT,
  p_ramo_id INT,
  p_cotizacion JSONB,
  p_coberturas JSONB,
  p_variantes JSONB
)
RETURNS INT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_numero_correlativo INT;
  v_cotizacion_id INT;
BEGIN
  v_numero_correlativo := siguiente_correlativo(p_ramo_id);

  INSERT INTO cotizaciones (
    numero_cotizacion, ramo_id, plan_id, agente_id, cliente_nombre, cliente_contacto,
    riesgo_datos, capital_asegurado, estado, moneda,
    tipo_cambio_snapshot, tipo_cambio_fuente, tipo_cambio_fecha
  ) VALUES (
    p_prefijo_numero || '-' || v_numero_correlativo,
    p_ramo_id,
    (p_cotizacion->>'plan_id')::INT,
    (p_cotizacion->>'agente_id')::INT,
    p_cotizacion->>'cliente_nombre',
    p_cotizacion->>'cliente_contacto',
    p_cotizacion->'riesgo_datos',
    (p_cotizacion->>'capital_asegurado')::NUMERIC,
    COALESCE(p_cotizacion->>'estado', 'cotizada'),
    COALESCE(p_cotizacion->>'moneda', 'PYG'),
    (p_cotizacion->>'tipo_cambio_snapshot')::NUMERIC,
    p_cotizacion->>'tipo_cambio_fuente',
    (p_cotizacion->>'tipo_cambio_fecha')::TIMESTAMPTZ
  ) RETURNING id INTO v_cotizacion_id;

  PERFORM _insertar_detalle_cotizacion(v_cotizacion_id, p_ramo_id, p_coberturas, p_variantes);

  RETURN v_cotizacion_id;
END;
$$;

-- Edición atómica: bloquea la cabecera (`FOR UPDATE`, serializa ediciones concurrentes de la
-- misma cotización), borra el detalle viejo por `cotizacion_id` (DELETE ciego — dentro de una
-- transacción no hace falta el truco de "insertar antes de borrar por IDs capturados" que usa
-- hoy actualizarCotizacion en JS, que solo existía para sobrevivir una falla no-transaccional),
-- actualiza los campos editables de la cabecera y reinserta el detalle con números de variante
-- NUEVOS (no se reciclan correlativos ya emitidos — mismo comportamiento actual).
--
-- `ramo_id`/`numero_cotizacion`/`agente_id` NO se tocan acá: son identidad de la cotización
-- (cotizacion.service.js ya lo garantiza en JS antes de llamar a este RPC, comparando
-- `ramo.id !== existente.ramo_id`).
--
-- `tipo_cambio_*`: solo se pisan si la clave correspondiente viene en `p_cotizacion` (esta
-- edición volvió a necesitar conversión); si no, se preserva el valor existente — mismo
-- criterio que el spread condicional de actualizarCotizacion hoy.
CREATE OR REPLACE FUNCTION actualizar_cotizacion_atomica(
  p_cotizacion_id INT,
  p_cotizacion JSONB,
  p_coberturas JSONB,
  p_variantes JSONB
)
RETURNS INT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_ramo_id INT;
BEGIN
  SELECT ramo_id INTO v_ramo_id
  FROM cotizaciones
  WHERE id = p_cotizacion_id
  FOR UPDATE;

  IF v_ramo_id IS NULL THEN
    RAISE EXCEPTION 'Cotización % no encontrada', p_cotizacion_id;
  END IF;

  -- DELETE ciego por cotizacion_id: cotizacion_plan_pago/cotizacion_ajustes se van solos por
  -- ON DELETE CASCADE desde cotizacion_variantes (migración 005) — no hace falta borrarlos acá.
  DELETE FROM cotizacion_variantes WHERE cotizacion_id = p_cotizacion_id;
  DELETE FROM cotizacion_coberturas WHERE cotizacion_id = p_cotizacion_id;

  UPDATE cotizaciones SET
    cliente_nombre = p_cotizacion->>'cliente_nombre',
    cliente_contacto = p_cotizacion->>'cliente_contacto',
    riesgo_datos = p_cotizacion->'riesgo_datos',
    capital_asegurado = (p_cotizacion->>'capital_asegurado')::NUMERIC,
    plan_id = (p_cotizacion->>'plan_id')::INT,
    estado = COALESCE(p_cotizacion->>'estado', 'cotizada'),
    moneda = COALESCE(p_cotizacion->>'moneda', 'PYG'),
    tipo_cambio_snapshot = CASE WHEN p_cotizacion ? 'tipo_cambio_snapshot'
      THEN (p_cotizacion->>'tipo_cambio_snapshot')::NUMERIC ELSE tipo_cambio_snapshot END,
    tipo_cambio_fuente = CASE WHEN p_cotizacion ? 'tipo_cambio_fuente'
      THEN p_cotizacion->>'tipo_cambio_fuente' ELSE tipo_cambio_fuente END,
    tipo_cambio_fecha = CASE WHEN p_cotizacion ? 'tipo_cambio_fecha'
      THEN (p_cotizacion->>'tipo_cambio_fecha')::TIMESTAMPTZ ELSE tipo_cambio_fecha END
  WHERE id = p_cotizacion_id;

  PERFORM _insertar_detalle_cotizacion(p_cotizacion_id, v_ramo_id, p_coberturas, p_variantes);

  RETURN p_cotizacion_id;
END;
$$;

-- RLS es default-deny desde la migración 046, pero PostgREST igual expone por default cualquier
-- función del schema `public` como endpoint RPC llamable por `anon`/`authenticated` — sin este
-- REVOKE, estas 3 funciones SECURITY INVOKER quedarían como un path de escritura no autenticado
-- (el backend siempre llama con `SUPABASE_SERVICE_KEY`, que bypasea GRANT/REVOKE de rol).
-- `REVOKE ... FROM anon, authenticated` NO alcanza: Postgres otorga EXECUTE a PUBLIC por
-- defecto al crear una función, y ese grant de PUBLIC sigue habilitando a anon/authenticated
-- aunque se les revoque explícitamente (confirmado con pg_proc.proacl contra Supabase real:
-- `{=X/postgres,...}` — el `=` sin rol es el grant a PUBLIC). Hay que revocar de PUBLIC también.
REVOKE EXECUTE ON FUNCTION _insertar_detalle_cotizacion(INT, INT, JSONB, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION crear_cotizacion_atomica(TEXT, INT, JSONB, JSONB, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION actualizar_cotizacion_atomica(INT, JSONB, JSONB, JSONB) FROM PUBLIC;
