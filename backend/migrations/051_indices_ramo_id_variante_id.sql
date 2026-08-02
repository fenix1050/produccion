-- Índices en FKs de alto tráfico que la migración 033 no cubrió.
-- Ver GitHub issue #83 (auditoría de performance, 2026-08-02), hallazgo #2.

-- Filtradas en cada preview/creación de cotización (coberturas.repository.js:
-- findCoberturasCatalogoByRamoId, findTasasCoberturaRamo), hoy mitigado solo por
-- el cache en memoria de 5 min de cotizacion.service.js.
CREATE INDEX idx_coberturas_catalogo_ramo_id ON coberturas_catalogo(ramo_id);
CREATE INDEX idx_tasas_cobertura_ramo_ramo_id ON tasas_cobertura_ramo(ramo_id);

-- Embebida en cada join de findCotizacionById (mismo tipo de FK que 033 indexó
-- para cotizacion_coberturas/cotizacion_variantes, pero no para esta tabla hermana).
CREATE INDEX idx_cotizacion_ajustes_variante_id ON cotizacion_ajustes(variante_id);
