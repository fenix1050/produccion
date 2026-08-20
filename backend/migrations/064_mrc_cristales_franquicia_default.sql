-- Update only the MRC Cristales catalog default for future quotations. Existing
-- cotizacion_coberturas snapshots remain unchanged.
UPDATE coberturas_catalogo AS cobertura
SET franquicia_default = 500000
WHERE cobertura.codigo = 'cristales'
  AND cobertura.franquicia_default = 1200000
  AND EXISTS (
    SELECT 1
    FROM ramos AS ramo
    WHERE ramo.id = cobertura.ramo_id
      AND ramo.nombre = 'mrc'
  );
