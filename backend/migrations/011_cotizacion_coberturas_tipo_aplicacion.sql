-- 011_cotizacion_coberturas_tipo_aplicacion.sql
-- Cobertura vs. sublímite (ramos "Otros Riesgos": MRC, Incendio, etc. — NO aplica a Auto).
-- El asegurado decide en CADA cotización si una cobertura del catálogo se toma como
-- ítem propio (con prima) o como sublímite de otra (tope sin prima propia).

ALTER TABLE cotizacion_coberturas
  ADD COLUMN tipo_aplicacion VARCHAR(10) NOT NULL DEFAULT 'cobertura'
    CHECK (tipo_aplicacion IN ('cobertura', 'sublimite')),
  ADD COLUMN sublimite_porcentaje NUMERIC(6,3),
  ADD COLUMN sublimite_monto_maximo NUMERIC(14,2);