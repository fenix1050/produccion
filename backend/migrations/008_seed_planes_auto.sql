-- 008_seed_planes_auto.sql
-- Carga inicial de los planes de Auto con los valores reales que Kevin fue confirmando
-- contra las pantallas del cotizador actual. Básico usa Tasa Única (no tasas_capital) —
-- ver nota al final y pendiente #4 en PLAN_DESARROLLO.md sección 11.

INSERT INTO planes (
  ramo_id, nombre, prima_tecnica_minima, cotizacion_combinada,
  tipo_franquicia, franquicia_porcentaje, descuento_default, descuento_maximo, recargo_maximo,
  cuotas_default, cuotas_maximo
)
SELECT id, 'PLAN TAJY PREMIUM', 3190000, TRUE,
       'monto_fijo_por_siniestro', 12, 20, 20, 100,
       11, 11
FROM ramos WHERE nombre = 'auto';

INSERT INTO planes (
  ramo_id, nombre, prima_tecnica_minima, cotizacion_combinada,
  tipo_franquicia, franquicia_porcentaje, descuento_default, descuento_maximo, recargo_maximo,
  cuotas_default, cuotas_maximo
)
SELECT id, 'PLAN TAJY SUPERIOR', 2695000, TRUE,
       'monto_fijo_por_siniestro', 12, 20, 20, 100,
       11, 11
FROM ramos WHERE nombre = 'auto';

INSERT INTO planes (
  ramo_id, nombre, prima_tecnica_minima, cotizacion_combinada,
  tipo_franquicia, franquicia_porcentaje, descuento_default, descuento_maximo, recargo_maximo,
  cuotas_default, cuotas_maximo
)
SELECT id, 'PLAN TAJY FUERTE', 2365000, TRUE,
       'monto_fijo_por_siniestro', 12, 20, 55, 100,
       11, 11
FROM ramos WHERE nombre = 'auto';

INSERT INTO planes (
  ramo_id, nombre, prima_tecnica_minima, cotizacion_combinada,
  descuento_maximo, recargo_maximo, cuotas_default, cuotas_maximo
)
SELECT id, 'PLAN TAJY NOBLE', 1661000, FALSE,
       20, 100, 11, 11
FROM ramos WHERE nombre = 'auto';

INSERT INTO planes (
  ramo_id, nombre, prima_tecnica_minima, cotizacion_combinada,
  descuento_maximo, recargo_maximo, cuotas_default, cuotas_maximo
)
SELECT id, 'PLAN TAJY BASICO', 645000, FALSE,
       20, 100, 11, 11
FROM ramos WHERE nombre = 'auto';
-- NOTA: Básico usa "Tasa Única" (1,64% fija sobre la cobertura de RC) en vez de tasas_capital.
-- El calculador de Auto (auto.calculator.js) todavía no distingue este caso — ver pendiente #4.

-- RPF fijo por forma de pago — igual en los 5 planes según las pantallas que mostró Kevin
INSERT INTO plan_formas_pago (plan_id, forma_pago_id, tasa_rpf)
SELECT p.id, fp.id,
  CASE fp.codigo
    WHEN 'contado' THEN 0
    WHEN 'cobrador' THEN 1.6
    WHEN 'boca_cobranza' THEN 1.35
    WHEN 'tarjeta_credito' THEN 1
  END
FROM planes p
CROSS JOIN formas_pago fp
WHERE p.nombre LIKE 'PLAN TAJY %';
