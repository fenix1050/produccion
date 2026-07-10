-- 009_correlativos_rpc.sql
-- Incremento atómico del correlativo por ramo (evita colisión de números
-- bajo cotizaciones concurrentes; el UPDATE ... RETURNING toma el lock de
-- fila dentro de la misma transacción, sin el hueco select→update en dos pasos).

CREATE OR REPLACE FUNCTION siguiente_correlativo(p_ramo_id INT)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_siguiente INT;
BEGIN
  UPDATE correlativos
  SET ultimo_numero = ultimo_numero + 1
  WHERE ramo_id = p_ramo_id
  RETURNING ultimo_numero INTO v_siguiente;

  IF v_siguiente IS NULL THEN
    RAISE EXCEPTION 'No existe correlativo para ramo_id=%', p_ramo_id;
  END IF;

  RETURN v_siguiente;
END;
$$;
