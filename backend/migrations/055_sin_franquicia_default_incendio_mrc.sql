-- Ajuste pedido por Análisis de Riesgo (Ajuste MC.xlsx): Incendio Contenido e Incendio
-- Mobiliario y Equipos (dentro de MRC) quedan sin franquicia por defecto, igual que Incendio
-- Edificio (ya en NULL desde el seed original). franquicia_default = NULL hace que el cotizador
-- precargue "Sin deducible" en vez de un monto fijo — el agente sigue pudiendo elegir una
-- franquicia manualmente (franquiciaValorPorDefecto en frontend/cotizar/cotizar.js ya trata
-- NULL igual que hace hoy con incendio_edificio).
UPDATE coberturas_catalogo c
SET franquicia_default = NULL
FROM ramos r
WHERE c.ramo_id = r.id
  AND r.nombre = 'mrc'
  AND c.codigo IN ('incendio_contenido', 'incendio_mobiliario_equipos');
