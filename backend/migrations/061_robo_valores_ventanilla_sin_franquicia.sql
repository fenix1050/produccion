-- Robo valores ventanilla no debe mostrar franquicia en la Carta Oferta de MRC, igual que el
-- resto de los sub-límites fijos (agua/equipos electrónicos/granizo/murallas y cercos). Hasta
-- ahora franquicia_default=500000 en coberturas_catalogo hacía que
-- mrc.calculator.js#construirListaCoberturas heredara ese valor por defecto (el agente no puede
-- elegir otra franquicia para este código: cotizar.js lo excluye del selector porque el monto se
-- auto-calcula al 30% de "Valores en caja fuerte", no lo carga a mano). Mismo patrón que la
-- migración 045 (franquicia_default=NULL en Incendio Contenido/Mobiliario).
-- Alcance solo hacia adelante: cotizaciones ya emitidas guardan su franquicia como snapshot en
-- cotizacion_coberturas y no se ven afectadas por este UPDATE.
UPDATE coberturas_catalogo
SET franquicia_default = NULL
WHERE codigo = 'robo_valores_ventanilla';
