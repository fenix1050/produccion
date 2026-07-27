-- 039_pisos_y_topes_incendio_3_planes.sql
-- Confirmación de Kevin (2026-07-27) de los datos que la migración 038 dejó pendientes: cierra
-- el estado "pendiente de confirmación" que bloqueaba estos 3 planes en el selector del frontend
-- (`planEsCalculable` en cotizar.js exige `prima_tecnica_minima != null`).
--
-- Prima Técnica Mínima: mismo piso que ya usa "INCENDIO - EDIFICIO Y CONTENIDO" (Gs. 409.091,
-- migración 013) — confirmado por Kevin como el mismo valor para los 3 planes nuevos.
--
-- Responsabilidad Máx. Cotizable: Gs. 60.000.000.000 para los 3 planes nuevos de Incendio
-- (Hipotecario, con Inspección, sin Inspección). Aprovechamos para cargar también el tope de
-- "MAQUINARIA BASICO" (USD 5.000.000), que quedaba NULL desde la migración 018 — ese plan es
-- USD-only (`monedas_permitidas = {USD}`, migración 034), así que el tope se compara
-- directamente contra el capital declarado en USD, sin necesidad de una columna separada por
-- moneda (a diferencia de `prima_tecnica_minima_usd`, que sí es explícita porque puede diferir
-- del piso en Gs.).
--
-- Umbral de inspección: Kevin confirma USD 700.000 como el monto final (quedaba como "~USD
-- 700.000, no confirmado" desde la migración 035/038). Aplica solo a "con Inspección"/"sin
-- Inspección" — "Hipotecario" queda exento de la regla (`umbral_inspeccion_monto` sigue NULL ahí).

UPDATE planes
SET prima_tecnica_minima = 409091,
    responsabilidad_maxima_cotizable = 60000000000
WHERE nombre IN ('INCENDIO HIPOTECARIO', 'INCENDIO CON INSPECCION', 'INCENDIO SIN INSPECCION');

UPDATE planes
SET responsabilidad_maxima_cotizable = 5000000
WHERE nombre = 'MAQUINARIA BASICO';

UPDATE planes
SET umbral_inspeccion_monto = 700000,
    umbral_inspeccion_moneda = 'USD'
WHERE nombre IN ('INCENDIO CON INSPECCION', 'INCENDIO SIN INSPECCION');
