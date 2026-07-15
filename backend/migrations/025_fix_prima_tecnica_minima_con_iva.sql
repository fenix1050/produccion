-- 025_fix_prima_tecnica_minima_con_iva.sql
-- REVERTIDA por la migración 026 — se dejó este archivo tal cual se aplicó (no se edita ni se
-- borra una migración ya aplicada a Supabase real) para que el historial de archivos coincida
-- con el historial real de la base.
--
-- Kevin había pedido corregir el piso de Prima Técnica Mínima a Gs. 450.000 (ya con IVA), pero
-- esto asumía que prima_tecnica_minima era un valor post-IVA. En realidad es un piso PRE-IVA
-- (mrc.calculator.js/incendio.calculator.js lo comparan contra `prima`, y calcularPlanPago recién
-- después suma IVA/RPF) — el valor original 409.091 ya rendía el Premio final correcto
-- (409.091 × 1,10 ≈ 450.000). Ver migración 026 para el revert.

UPDATE planes
SET prima_tecnica_minima = 450000
WHERE nombre IN ('MULTIRRIESGO COMERCIO - NORMAL', 'INCENDIO - EDIFICIO Y CONTENIDO')
  AND prima_tecnica_minima = 409091;
