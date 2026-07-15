-- 026_revertir_prima_tecnica_minima_pre_iva.sql
-- Revierte la migración 025: prima_tecnica_minima es un piso PRE-IVA (calcularPlanPago le suma
-- IVA después). Kevin confirmó que Gs. 450.000 es el Premio final YA CON IVA — pero
-- 409.091 × 1,10 = 450.000,1, así que el valor original ya era el correcto para llegar a un
-- Premio de 450.000. Subirlo a 450.000 hacía que se le sumara el IVA dos veces (Premio final
-- 495.000). Se revierte a 409.091 para MULTIRRIESGO COMERCIO - NORMAL e
-- INCENDIO - EDIFICIO Y CONTENIDO.

UPDATE planes
SET prima_tecnica_minima = 409091
WHERE nombre IN ('MULTIRRIESGO COMERCIO - NORMAL', 'INCENDIO - EDIFICIO Y CONTENIDO')
  AND prima_tecnica_minima = 450000;
