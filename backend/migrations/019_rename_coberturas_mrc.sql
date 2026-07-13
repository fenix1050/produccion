-- Renombra las coberturas de MRC (y solo MRC) para que coincidan con la nomenclatura del
-- sistema de escritorio de Tajy (fuente: "Version 01 - Calculo Varios.xlsx", carpeta insumos).
-- Se quita el sufijo "hasta la suma de..." de cada nombre — es texto de UI del Excel,
-- no parte del nombre de la cobertura.
--
-- IMPORTANTE: coberturas_catalogo.codigo NO es único entre ramos — incendio_edificio e
-- incendio_contenido existen tanto en 'mrc' como en 'incendio'. Este UPDATE filtra también
-- por ramo_id para no afectar al ramo Incendio (que mantiene sus nombres originales).

UPDATE coberturas_catalogo cc SET nombre = 'Incendio de edificio'
FROM ramos r WHERE cc.ramo_id = r.id AND r.nombre = 'mrc' AND cc.codigo = 'incendio_edificio';

UPDATE coberturas_catalogo cc SET nombre = 'Incendio Contenido'
FROM ramos r WHERE cc.ramo_id = r.id AND r.nombre = 'mrc' AND cc.codigo = 'incendio_contenido';

UPDATE coberturas_catalogo cc SET nombre = 'Incendio mobiliarios y equipos'
FROM ramos r WHERE cc.ramo_id = r.id AND r.nombre = 'mrc' AND cc.codigo = 'incendio_mobiliario_equipos';

UPDATE coberturas_catalogo cc SET nombre = 'Robo contenido'
FROM ramos r WHERE cc.ramo_id = r.id AND r.nombre = 'mrc' AND cc.codigo = 'robo_contenido';

UPDATE coberturas_catalogo cc SET nombre = 'Cristales'
FROM ramos r WHERE cc.ramo_id = r.id AND r.nombre = 'mrc' AND cc.codigo = 'cristales';

UPDATE coberturas_catalogo cc SET nombre = 'Valores en tránsito'
FROM ramos r WHERE cc.ramo_id = r.id AND r.nombre = 'mrc' AND cc.codigo = 'robo_transito';

UPDATE coberturas_catalogo cc SET nombre = 'Valores en caja fuerte'
FROM ramos r WHERE cc.ramo_id = r.id AND r.nombre = 'mrc' AND cc.codigo = 'robo_caja_registradora';

UPDATE coberturas_catalogo cc SET nombre = 'Resp. Civil'
FROM ramos r WHERE cc.ramo_id = r.id AND r.nombre = 'mrc' AND cc.codigo = 'responsabilidad_civil';

UPDATE coberturas_catalogo cc SET nombre = 'Daños a murallas, cercados perimetrales y rejas'
FROM ramos r WHERE cc.ramo_id = r.id AND r.nombre = 'mrc' AND cc.codigo = 'sublimite_murallas_cercos';

UPDATE coberturas_catalogo cc SET nombre = 'Daños por granizos'
FROM ramos r WHERE cc.ramo_id = r.id AND r.nombre = 'mrc' AND cc.codigo = 'sublimite_granizo';

UPDATE coberturas_catalogo cc SET nombre = 'Daños por agua'
FROM ramos r WHERE cc.ramo_id = r.id AND r.nombre = 'mrc' AND cc.codigo = 'sublimite_danos_agua';

UPDATE coberturas_catalogo cc SET nombre = 'Daños a los Equipos Electrónicos'
FROM ramos r WHERE cc.ramo_id = r.id AND r.nombre = 'mrc' AND cc.codigo = 'sublimite_equipos_electronicos';