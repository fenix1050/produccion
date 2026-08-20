-- Los dos sublímites de MRC tienen franquicia obligatoria: 10% en todo y cada
-- siniestro, con mínimo de Gs. 500.000. El monto persistido representa ese mínimo.
-- Este UPDATE solo modifica el catálogo para cotizaciones nuevas; los snapshots
-- existentes en cotizacion_coberturas no se alteran.
UPDATE coberturas_catalogo
SET franquicia_default = 500000
WHERE ramo_id = (SELECT id FROM ramos WHERE nombre = 'mrc')
  AND codigo IN ('robo_valores_ventanilla', 'sublimite_equipos_electronicos');
