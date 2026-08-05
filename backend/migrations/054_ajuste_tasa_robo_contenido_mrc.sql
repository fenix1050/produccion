-- Ajuste de tasa pedido por Análisis de Riesgo (Ajuste MC.xlsx): Robo y/o Asalto del Contenido
-- pasa de 8‰ a 10‰ en MRC. Es el único valor de tasas_cobertura_ramo que cambió respecto al
-- seed original (012_seed_mrc.sql) — el resto del Excel ya coincide con la tasa vigente.
UPDATE tasas_cobertura_ramo t
SET tasa_valor = 10.0
FROM coberturas_catalogo c, ramos r
WHERE t.cobertura_id = c.id
  AND c.ramo_id = r.id
  AND r.nombre = 'mrc'
  AND c.codigo = 'robo_contenido';
