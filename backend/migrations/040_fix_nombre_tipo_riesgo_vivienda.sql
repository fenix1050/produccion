-- 040_fix_nombre_tipo_riesgo_vivienda.sql
-- Fix descubierto en verificación en vivo (2026-07-27) del cambio "incendio-3-planes-y-moneda":
-- `findTasasRiesgoObjeto` (coberturas.repository.js) matchea `tipos_riesgo_incendio.nombre`
-- contra `riesgoDatos.rubro_actividad` por igualdad exacta de string. La migración 038 sembró
-- la tasa como 'VIVIENDA FAMILIAR', pero el catálogo de rubros de actividad (`/ramos/
-- rubros-actividad`, compartido con MRC) usa 'VIVIENDA' — nunca hacían match, todo intento de
-- cotizar VIVIENDA con los 3 planes nuevos rechazaba con 422 "Tipo de Riesgo sin tasas
-- confirmadas". Confirmado por Kevin: renombrar la tasa para alinearla con el catálogo existente.

UPDATE tipos_riesgo_incendio
SET nombre = 'VIVIENDA'
WHERE nombre = 'VIVIENDA FAMILIAR';
