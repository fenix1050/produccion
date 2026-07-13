-- 016_fix_vida_ap_tarifas.sql
-- Fix de fiabilidad sobre la migración 015 (Vida y Accidentes Personales), detectado en
-- review-reliability antes de cerrar Fase 6/7. Mismo patrón que la migración 014 (fix sobre la
-- 013 de Incendio): no se revierte la 015, se corrige encima.
--
-- Hallazgos corregidos:
--  1. Tres nombres de clave distintos para el mismo concepto de "recargo porcentual"
--     (`recargo_sobre_tasa_normal_pct`, `recargo_pct`, `recargo`) — se unifica todo a
--     `recargo_pct`, para que el futuro `vida-ap.js` no tenga que revisar 3 nombres.
--  2. Dos nombres de clave distintos para el mismo concepto de "tope de monto asegurable"
--     (`limite_suma_asegurada` en Protección de Préstamos - Cooperativas vs. `monto_maximo` en
--     Mercado General) — se unifica todo a `monto_maximo`.
--  3. La fila de Aportes y Ahorros con `pct_capital: 100` (cobertura al 100% "hasta los 54 años
--     inclusive") no tenía `edad_min`, a diferencia de sus 3 filas hermanas que sí traen
--     `edad_min` + `edad_max`. Una lectura genérica tipo `edad >= edad_min` habría tratado ese
--     campo como `undefined` y vuelto esa franja inalcanzable para cualquier edad, incluidas las
--     edades 0-54 donde sí debía aplicar. Se agrega `edad_min: 0`.
--  4. 5 coberturas cargadas en `coberturas_catalogo` (migración 015) nunca aparecían como
--     `cobertura_codigo` en ninguna fila de `tarifas_generico`: `invalidez_accidente_ap`,
--     `gastos_medicos_accidente`, `gastos_sepelio_accidente` (Accidentes Personales — el manual
--     las describe como incluidas dentro de la tasa básica de `muerte_accidente_ap`, pero eso
--     solo estaba en el comentario SQL, no en el dato), `reembolso_gastos_funerarios`
--     (Protección Familiar) y `perdidas_organicas` (Vida Directivos / Aportes y Ahorros). Como
--     `tarifas_generico.variables` es JSONB sin FK, un futuro lookup por `cobertura_codigo` habría
--     encontrado cero filas para estas 5 coberturas. Se agregan filas explícitas que documentan
--     la relación como dato, no solo como comentario.
--
-- Nota sobre `edad_cumplida` (filas de reducción de capital de jubilados, plan VIDA DIRECTIVOS Y
-- EMPLEADOS): esa forma NO se toca acá. No es una franja etaria sino una edad disparadora (a
-- partir de la cual se aplica una reducción fija de capital), ya se distingue con su propio
-- `"tipo":"reduccion_capital_jubilados"` — un lector genérico debe revisar `tipo` antes de asumir
-- forma de franja, igual que ya debe hacerlo con `robo_tarjeta` (`"tipo":"monto_fijo"`).

-- ============ 1. Unificar recargo_sobre_tasa_normal_pct / recargo → recargo_pct ============

UPDATE tarifas_generico
SET variables = (variables - 'recargo_sobre_tasa_normal_pct') || jsonb_build_object('recargo_pct', variables -> 'recargo_sobre_tasa_normal_pct')
WHERE variables ? 'recargo_sobre_tasa_normal_pct';

UPDATE tarifas_generico
SET variables = (variables - 'recargo') || jsonb_build_object('recargo_pct', variables -> 'recargo')
WHERE variables ? 'recargo' AND NOT (variables ? 'recargo_pct');

-- ============ 2. Unificar limite_suma_asegurada → monto_maximo ============

UPDATE tarifas_generico
SET variables = (variables - 'limite_suma_asegurada') || jsonb_build_object('monto_maximo', variables -> 'limite_suma_asegurada')
WHERE variables ? 'limite_suma_asegurada';

-- ============ 3. Completar edad_min faltante (Aportes y Ahorros, pct_capital 100) ============

UPDATE tarifas_generico
SET variables = variables || jsonb_build_object('edad_min', 0)
WHERE variables ->> 'cobertura_codigo' = 'muerte_accidental_doble_indemnizacion'
  AND variables ->> 'pct_capital' = '100'
  AND NOT (variables ? 'edad_min');

-- ============ 4. Filas faltantes para las 5 coberturas sin tarifa asociada ============

-- Accidentes Personales (ambos sectores): estas 3 coberturas están incluidas dentro de la tasa
-- básica de muerte_accidente_ap del mismo plan — el manual no les da tasa propia adicional.
INSERT INTO tarifas_generico (ramo_id, plan_id, variables)
SELECT r.id, p.id, v.vars::jsonb
FROM ramos r
JOIN planes p ON p.ramo_id = r.id AND p.nombre IN ('ACCIDENTES PERSONALES - SECTOR COOPERATIVO', 'ACCIDENTES PERSONALES - SECTOR PRIVADO')
CROSS JOIN (VALUES
  ('{"cobertura_codigo":"invalidez_accidente_ap","incluida_sin_tasa_propia":true,"nota":"Incluida dentro de la tasa de coberturas básicas de muerte_accidente_ap del mismo plan — el manual no le da tasa propia"}'),
  ('{"cobertura_codigo":"gastos_medicos_accidente","incluida_sin_tasa_propia":true,"nota":"Incluida dentro de la tasa de coberturas básicas de muerte_accidente_ap; la suma asegurada no puede exceder la fijada para muerte/invalidez (manual, Anexo 2)"}'),
  ('{"cobertura_codigo":"gastos_sepelio_accidente","tasa_confirmada":false,"nota":"Sin tasa propia confirmada en el manual — solo se vio con suma asegurada propia en la cotización real de Floriano Kochhan Hoffmann (2026-07-08), sin desglose de tasa"}')
) AS v(vars);

-- Protección Familiar: reembolso_gastos_funerarios comparte la tasa única de 10‰ del plan.
INSERT INTO tarifas_generico (ramo_id, plan_id, variables)
SELECT r.id, p.id,
  '{"cobertura_codigo":"reembolso_gastos_funerarios","tasa":10.0,"unidad":"permil","nota":"Misma tasa única de fallecimiento_cualquier_causa (manual, Anexo 2) — Protección Familiar no desglosa tasas distintas por cobertura"}'::jsonb
FROM ramos r JOIN planes p ON p.ramo_id = r.id AND p.nombre = 'PROTECCION FAMILIAR';

-- Vida Directivos y Empleados / Aportes y Ahorros: perdidas_organicas está incluida en la tasa
-- básica del plan, sin costo adicional (confirmado textualmente en el manual).
INSERT INTO tarifas_generico (ramo_id, plan_id, variables)
SELECT r.id, p.id,
  '{"cobertura_codigo":"perdidas_organicas","incluida_sin_costo_adicional":true,"nota":"El manual aclara que el costo de esta cobertura está incluido en la tasa básica del plan (fallecimiento_cualquier_causa / muerte_accidental_doble_indemnizacion), sin tasa propia"}'::jsonb
FROM ramos r JOIN planes p ON p.ramo_id = r.id AND p.nombre IN ('VIDA DIRECTIVOS Y EMPLEADOS', 'APORTES Y AHORROS');
