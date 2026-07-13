-- 023_rpf_incendio_y_vida_ap.sql
-- RPF confirmado por Kevin (2026-07-13, tabla de forma de pago del sistema de escritorio):
-- Contado 0% / Cobrador 1,6% / Boca de Cobranza 1,35% / Tarjeta 1% — FIJO por forma de pago,
-- igual para TODOS los planes de Incendio y de Vida y Accidentes Personales (mismo criterio que
-- ya usa MRC: no varía por cantidad de cuotas, pese a que el manual de suscripción
-- M-08OP-GT-01 trae una tabla de R.P.F. por cuotas — Kevin confirmó que NO se usa esa tabla,
-- se usa este valor plano).
--
-- Prima Técnica Mínima / Premio Mínimo para Incendio (Anexo 3 del manual de suscripción
-- "Incendio, Hogar, Comercio y TRO" v.02): el manual transcribe Gs. 409.909, pero Kevin
-- confirmó que el valor correcto es Gs. 409.091 (el mismo ya cargado para
-- MULTIRRIESGO COMERCIO - NORMAL, migración 012 — confirmado en su momento contra pantalla
-- real). No se carga un "premio_minimo" separado: esa columna no existe en el schema y MRC
-- tampoco la usa hoy (mrc.calculator.js solo aplica prima_tecnica_minima como piso).
--
-- Vida y Accidentes Personales: Kevin confirmó que POR EL MOMENTO no se maneja prima técnica
-- mínima para estos planes — se carga el RPF pero se deja prima_tecnica_minima en NULL a
-- propósito (no es un dato pendiente, es una decisión: vida-ap.calculator.js no debe exigirla
-- como piso, a diferencia de mrc.calculator.js/incendio).

-- ============ INCENDIO ============

-- Reactiva "INCENDIO - EDIFICIO Y CONTENIDO" (desactivado en la migración 014 por no tener
-- prima_tecnica_minima) ahora que el piso está confirmado.
UPDATE planes
SET prima_tecnica_minima = 409091, activo = TRUE
WHERE nombre = 'INCENDIO - EDIFICIO Y CONTENIDO'
  AND ramo_id = (SELECT id FROM ramos WHERE nombre = 'incendio');

INSERT INTO plan_formas_pago (plan_id, forma_pago_id, tasa_rpf, habilitada)
SELECT p.id, fp.id, v.tasa, TRUE
FROM planes p
JOIN formas_pago fp ON TRUE
CROSS JOIN (VALUES
  ('contado', 0.0),
  ('cobrador', 1.6),
  ('boca_cobranza', 1.35),
  ('tarjeta_credito', 1.0)
) AS v(codigo, tasa)
WHERE p.nombre = 'INCENDIO - EDIFICIO Y CONTENIDO' AND fp.codigo = v.codigo;

-- "Maquinaria Básico" solo tenía Contado/Cobrador confirmados (migración 013, RPF parcial
-- dictado por Kevin en su momento) — ahora se completa Boca de Cobranza/Tarjeta con el mismo
-- valor plano ya confirmado para el resto de Incendio.
UPDATE plan_formas_pago
SET tasa_rpf = 1.35, habilitada = TRUE
WHERE plan_id = (SELECT id FROM planes WHERE nombre = 'MAQUINARIA BASICO')
  AND forma_pago_id = (SELECT id FROM formas_pago WHERE codigo = 'boca_cobranza');

UPDATE plan_formas_pago
SET tasa_rpf = 1.0, habilitada = TRUE
WHERE plan_id = (SELECT id FROM planes WHERE nombre = 'MAQUINARIA BASICO')
  AND forma_pago_id = (SELECT id FROM formas_pago WHERE codigo = 'tarjeta_credito');

-- ============ VIDA Y ACCIDENTES PERSONALES ============
-- Ninguno de los 7 planes (migración 015) tenía fila en plan_formas_pago todavía.

INSERT INTO plan_formas_pago (plan_id, forma_pago_id, tasa_rpf, habilitada)
SELECT p.id, fp.id, v.tasa, TRUE
FROM planes p
JOIN ramos r ON r.id = p.ramo_id AND r.nombre = 'vida-ap'
JOIN formas_pago fp ON TRUE
CROSS JOIN (VALUES
  ('contado', 0.0),
  ('cobrador', 1.6),
  ('boca_cobranza', 1.35),
  ('tarjeta_credito', 1.0)
) AS v(codigo, tasa)
WHERE fp.codigo = v.codigo;
