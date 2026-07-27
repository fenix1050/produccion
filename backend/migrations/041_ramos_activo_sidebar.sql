-- 041_ramos_activo_sidebar.sql
-- El sidebar de /cotizar mostraba "Auto" y "Multirriesgo Hogar" como "Próximamente" mediante
-- un valor hardcodeado en frontend/cotizar/cotizar.js (RAMOS_UI), independiente de
-- `ramos.activo` (que por default de columna es TRUE para los 8 ramos seedeados en la
-- migración 002, incluidos auto/auto-flota/hogar/tro/transporte que nunca se implementaron).
-- Ahora el sidebar deriva el estado disponible/próximamente de `ramos.activo` (togglable
-- desde el panel admin, sección Ramos, solo rol admin — ver admin.routes.js). Sin este UPDATE,
-- el deploy de ese cambio de frontend haría aparecer Auto y Hogar como "disponibles" en el
-- sidebar de un día para el otro, algo que no fue pedido y que rompería la Fase 2 pausada.
UPDATE ramos
SET activo = false
WHERE nombre IN ('auto', 'hogar');
