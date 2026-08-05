-- El sublímite "Daños a murallas, cercados perimetrales y rejas" (sublimite_murallas_cercos)
-- quedó con incluida_por_defecto = FALSE en los 2 planes activos de MRC (NORMAL y SEGUCOOP),
-- a diferencia del seed original (012_seed_mrc.sql, TRUE) y del plan legacy "COMERCIO PROTECCION
-- TOTAL" (desactivado, sigue en TRUE). Por eso aparecía seleccionable en "Agregar cobertura
-- adicional" del cotizador en vez de listarse como sublímite fijo del plan — Análisis de Riesgo
-- confirmó (Ajuste MC.xlsx) que no debe poder elegirse por separado, ya que en MRC no existe una
-- cobertura propia equivalente.
UPDATE plan_coberturas pc
SET incluida_por_defecto = TRUE
FROM planes p, coberturas_catalogo c
WHERE pc.plan_id = p.id
  AND pc.cobertura_id = c.id
  AND c.codigo = 'sublimite_murallas_cercos'
  AND p.nombre IN ('MULTIRRIESGO COMERCIO - NORMAL', 'MULTIRRIESGO COMERCIO - SEGUCOOP');
