-- verificar-cotizacion-atomica.sql
-- Cambio SDD `cotizacion-transaccional` (issue #87 finding A1), Fase 5 (verificación contra
-- Postgres real). Prueba que `crear_cotizacion_atomica`/`actualizar_cotizacion_atomica`
-- (migración 052) sean realmente all-or-nothing: un FK inválido tardío (forma_pago_id
-- inexistente en la ÚLTIMA variante, no en la primera) debe deshacer TODO lo insertado en la
-- misma llamada -- incluido el incremento de `correlativos.ultimo_numero` -- y un intento
-- exitoso posterior debe poder reusar el mismo número, probando que el intento fallido no quemó
-- ningún correlativo.
--
-- Corre TODO dentro de una única transacción con ROLLBACK explícito al final (decisión tomada
-- con Kevin): ni siquiera el camino feliz deja una cotización real de MRC persistida -- cero
-- huella en producción, incluido no dejar ningún hueco en la numeración de MRC. Los resultados
-- de cada paso se acumulan en una tabla temporal (`ON COMMIT DROP`, de todos modos discartada
-- por el ROLLBACK) y se devuelven en un único SELECT antes de deshacer todo, así el cliente ya
-- recibió el reporte cuando la transacción se cierra.
--
-- Uso: pegar el archivo completo en un solo `execute_sql` (todas las sentencias deben viajar en
-- la misma conexión/transacción -- BEGIN/ROLLBACK no sobreviven entre llamadas separadas).
-- Ramo de prueba: MRC (ramo_id 5, único ramo `activo = true` hoy), plan_id 6 (plan real de MRC),
-- agente_id 1 y forma_pago_id 1 (Contado) son filas reales existentes, solo usadas como FK
-- válidas -- se descartan junto con todo lo demás en el ROLLBACK final.

BEGIN;

CREATE TEMP TABLE _verificacion_resultados (
  paso TEXT,
  esperado TEXT,
  obtenido TEXT,
  ok BOOLEAN
) ON COMMIT DROP;

DO $$
DECLARE
  v_ramo_id CONSTANT INT := 5; -- mrc
  v_plan_id CONSTANT INT := 6; -- plan real de MRC, activo
  v_agente_id CONSTANT INT := 1;
  v_forma_pago_valida CONSTANT INT := 1;
  v_forma_pago_invalida CONSTANT INT := 999999; -- no existe en formas_pago
  v_marker_fallo_crear CONSTANT TEXT := 'VERIFICACION-TEST-CREAR-FALLO';
  v_marker_ok CONSTANT TEXT := 'VERIFICACION-TEST-CREAR-OK';
  v_marker_fallo_actualizar CONSTANT TEXT := 'VERIFICACION-TEST-ACTUALIZAR-FALLO';

  v_correlativo_antes INT;
  v_correlativo_tras_fallo INT;
  v_correlativo_tras_ok INT;
  v_cotizacion_id INT;
  v_count INT;
  v_cliente_antes TEXT;
  v_cliente_tras_fallo TEXT;
  v_variantes_antes INT;
  v_variantes_tras_fallo INT;
  v_capturo_error BOOLEAN;
BEGIN
  SELECT ultimo_numero INTO v_correlativo_antes FROM correlativos WHERE ramo_id = v_ramo_id;

  -- PASO 1: crear_cotizacion_atomica con un forma_pago_id inexistente en la SEGUNDA variante --
  -- fallo tardío a propósito: la cabecera y la primera variante ya se insertaron dentro de la
  -- misma llamada cuando el FK de la segunda revienta. Un savepoint (BEGIN/EXCEPTION anidado)
  -- captura el error esperado para poder seguir verificando en la misma transacción -- esto es
  -- solo un artefacto del arnés de prueba, no algo que exista en el flujo real (una llamada RPC
  -- real desde el backend es su propia transacción de nivel superior sin savepoints).
  v_capturo_error := FALSE;
  BEGIN
    PERFORM crear_cotizacion_atomica(
      'TEST',
      v_ramo_id,
      jsonb_build_object(
        'plan_id', v_plan_id,
        'agente_id', v_agente_id,
        'cliente_nombre', 'VERIFICACION AUTOMATICA - NO ES CLIENTE REAL',
        'cliente_contacto', v_marker_fallo_crear,
        'riesgo_datos', '{}'::jsonb,
        'capital_asegurado', 50000000
      ),
      NULL,
      jsonb_build_array(
        jsonb_build_object(
          'tipo_franquicia', 'sin_franquicia',
          'franquicia_monto', 0,
          'prima', 1000000,
          'planes_pago', jsonb_build_array(
            jsonb_build_object('forma_pago_id', v_forma_pago_valida, 'cantidad_cuotas', 0,
              'rpf_porcentaje', 0, 'rpf_monto', 0, 'iva_monto', 100000,
              'premio_total', 1100000, 'monto_inicial', 1100000, 'monto_cuota', 0)
          )
        ),
        jsonb_build_object(
          'tipo_franquicia', 'sin_franquicia',
          'franquicia_monto', 0,
          'prima', 1000000,
          'planes_pago', jsonb_build_array(
            jsonb_build_object('forma_pago_id', v_forma_pago_invalida, 'cantidad_cuotas', 0,
              'rpf_porcentaje', 0, 'rpf_monto', 0, 'iva_monto', 100000,
              'premio_total', 1100000, 'monto_inicial', 1100000, 'monto_cuota', 0)
          )
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_capturo_error := TRUE;
  END;

  INSERT INTO _verificacion_resultados VALUES (
    '1. crear_cotizacion_atomica propaga el error de FK (no lo traga)',
    'true', v_capturo_error::text, v_capturo_error
  );

  SELECT ultimo_numero INTO v_correlativo_tras_fallo FROM correlativos WHERE ramo_id = v_ramo_id;
  INSERT INTO _verificacion_resultados VALUES (
    '2. correlativo de MRC sin cambios tras el intento fallido',
    v_correlativo_antes::text, v_correlativo_tras_fallo::text,
    v_correlativo_antes = v_correlativo_tras_fallo
  );

  SELECT count(*) INTO v_count FROM cotizaciones WHERE cliente_contacto = v_marker_fallo_crear;
  INSERT INTO _verificacion_resultados VALUES (
    '3. cero filas en cotizaciones para el intento fallido (cabecera no sobrevivió)',
    '0', v_count::text, v_count = 0
  );

  -- PASO 2: happy path reutilizando el mismo número -- prueba que el intento fallido de arriba
  -- no quemó ningún correlativo.
  v_cotizacion_id := crear_cotizacion_atomica(
    'TEST',
    v_ramo_id,
    jsonb_build_object(
      'plan_id', v_plan_id,
      'agente_id', v_agente_id,
      'cliente_nombre', 'VERIFICACION AUTOMATICA - NO ES CLIENTE REAL',
      'cliente_contacto', v_marker_ok,
      'riesgo_datos', '{}'::jsonb,
      'capital_asegurado', 50000000
    ),
    NULL,
    jsonb_build_array(
      jsonb_build_object(
        'tipo_franquicia', 'sin_franquicia',
        'franquicia_monto', 0,
        'prima', 1000000,
        'planes_pago', jsonb_build_array(
          jsonb_build_object('forma_pago_id', v_forma_pago_valida, 'cantidad_cuotas', 0,
            'rpf_porcentaje', 0, 'rpf_monto', 0, 'iva_monto', 100000,
            'premio_total', 1100000, 'monto_inicial', 1100000, 'monto_cuota', 0)
        )
      )
    )
  );

  -- El camino feliz consume 2 correlativos (1 para numero_cotizacion de la cabecera + 1 para
  -- numero_variante de la única variante -- comparten el mismo contador POR RAMO, migración
  -- 042), no 1 -- lo que importa acá es que el intento fallido de arriba (que llegó a consumir
  -- 3: cabecera + variante1 + variante2 antes de fallar en el FK de variante2) NO dejó ningún
  -- residuo: el camino feliz arranca exactamente donde arrancaría si el intento fallido nunca
  -- hubiera ocurrido.
  SELECT ultimo_numero INTO v_correlativo_tras_ok FROM correlativos WHERE ramo_id = v_ramo_id;
  INSERT INTO _verificacion_resultados VALUES (
    '4. correlativo avanzó exactamente 2 desde la base (cabecera + 1 variante, no arrastra nada del intento fallido)',
    (v_correlativo_antes + 2)::text, v_correlativo_tras_ok::text,
    v_correlativo_tras_ok = v_correlativo_antes + 2
  );

  SELECT count(*) INTO v_count FROM cotizacion_variantes WHERE cotizacion_id = v_cotizacion_id;
  INSERT INTO _verificacion_resultados VALUES (
    '5. la cotización exitosa insertó su variante',
    '1', v_count::text, v_count = 1
  );

  -- PASO 3: actualizar_cotizacion_atomica con el mismo forma_pago_id inválido -- debe fallar sin
  -- tocar nada de lo que ya existía (el DELETE ciego + reinserción deben revertirse juntos).
  SELECT cliente_nombre INTO v_cliente_antes FROM cotizaciones WHERE id = v_cotizacion_id;
  SELECT count(*) INTO v_variantes_antes FROM cotizacion_variantes WHERE cotizacion_id = v_cotizacion_id;

  v_capturo_error := FALSE;
  BEGIN
    PERFORM actualizar_cotizacion_atomica(
      v_cotizacion_id,
      jsonb_build_object(
        'cliente_nombre', 'INTENTO DE EDICION QUE DEBE FALLAR',
        'cliente_contacto', v_marker_fallo_actualizar,
        'riesgo_datos', '{}'::jsonb,
        'capital_asegurado', 99999999,
        'plan_id', v_plan_id
      ),
      NULL,
      jsonb_build_array(
        jsonb_build_object(
          'tipo_franquicia', 'sin_franquicia',
          'franquicia_monto', 0,
          'prima', 1000000,
          'planes_pago', jsonb_build_array(
            jsonb_build_object('forma_pago_id', v_forma_pago_invalida, 'cantidad_cuotas', 0,
              'rpf_porcentaje', 0, 'rpf_monto', 0, 'iva_monto', 100000,
              'premio_total', 1100000, 'monto_inicial', 1100000, 'monto_cuota', 0)
          )
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    v_capturo_error := TRUE;
  END;

  INSERT INTO _verificacion_resultados VALUES (
    '6. actualizar_cotizacion_atomica propaga el error de FK',
    'true', v_capturo_error::text, v_capturo_error
  );

  SELECT cliente_nombre INTO v_cliente_tras_fallo FROM cotizaciones WHERE id = v_cotizacion_id;
  INSERT INTO _verificacion_resultados VALUES (
    '7. cliente_nombre intacto tras el intento de edición fallido',
    v_cliente_antes, v_cliente_tras_fallo, v_cliente_antes = v_cliente_tras_fallo
  );

  SELECT count(*) INTO v_variantes_tras_fallo FROM cotizacion_variantes WHERE cotizacion_id = v_cotizacion_id;
  INSERT INTO _verificacion_resultados VALUES (
    '8. cantidad de variantes intacta tras el intento de edición fallido (ni duplicó ni borró)',
    v_variantes_antes::text, v_variantes_tras_fallo::text,
    v_variantes_antes = v_variantes_tras_fallo
  );

  SELECT count(*) INTO v_count FROM cotizaciones WHERE cliente_contacto = v_marker_fallo_actualizar;
  INSERT INTO _verificacion_resultados VALUES (
    '9. cero filas nuevas por el intento de edición fallido',
    '0', v_count::text, v_count = 0
  );
END $$;

SELECT paso, esperado, obtenido, ok FROM _verificacion_resultados ORDER BY paso;

-- Deshace TODO lo de arriba -- incluido el camino feliz del PASO 2 -- para no dejar ninguna
-- cotización de prueba ni ningún hueco en el correlativo real de MRC.
ROLLBACK;
