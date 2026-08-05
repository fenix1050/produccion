-- 059_activar_rpf_por_cuotas.sql
-- Activa la curva de R.P.F. por cantidad de cuotas para MRC / Incendio / Vida y Accidentes
-- Personales (cambio SDD `rpf-variable-mrc`, PR2).
--
-- 058_rpf_por_cuotas.sql (PR1, ya aplicada contra Supabase real) creó la tabla `rpf_cuotas`
-- con las 33 filas de la curva y la columna `ramos.usa_rpf_por_cuotas`, pero dejó el flag en
-- FALSE para los 8 ramos a propósito: la forma más segura de desplegar (design.md, sección
-- "Migration / Rollout") es que el código que lee la curva (`resolverTasaRpf()` en
-- `backend/src/services/cotizacion.service.js`) llegue a producción ANTES o JUNTO con esta
-- migración — nunca después, o un preview en vivo de MRC/Incendio/Vida-AP podría pedir una
-- cantidad de cuotas fuera de rango y recibir un 422 sin que exista todavía el código que
-- resuelve la curva.
--
-- Rollback N1 (instantáneo, sin deploy): UPDATE ramos SET usa_rpf_por_cuotas = FALSE
-- WHERE nombre IN ('mrc', 'incendio', 'vida-ap'); — el escalar legacy `plan_formas_pago.tasa_rpf`
-- nunca se pisó, así que el rollback vuelve exactamente al comportamiento anterior.

UPDATE ramos
SET usa_rpf_por_cuotas = TRUE
WHERE nombre IN ('mrc', 'incendio', 'vida-ap');
