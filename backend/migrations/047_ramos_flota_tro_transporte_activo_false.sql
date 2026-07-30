-- 047_ramos_flota_tro_transporte_activo_false.sql
-- El sidebar de /cotizar acaba de sumar 'auto-flota', 'tro' y 'transporte' a RAMOS_UI
-- (frontend/cotizar/cotizar.js) para que el toggle "Activo" del panel admin (sección Ramos)
-- realmente controle su visibilidad ahí, igual que ya pasa con el resto de los ramos.
-- `ramos.activo` es TRUE por default de columna desde la migración 002 para los 8 ramos
-- seedeados, incluidos estos 3 que nunca se implementaron en el flujo de cotización
-- (no están en RAMOS_CON_CALCULO). Sin este UPDATE, el deploy de ese cambio de frontend
-- los mostraría como "disponibles" de un día para el otro, algo que no fue pedido — mismo
-- criterio que la migración 041 usó para auto/hogar.
UPDATE ramos
SET activo = false
WHERE nombre IN ('auto-flota', 'tro', 'transporte');
