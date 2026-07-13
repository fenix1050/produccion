-- 017_exclusiones_generales_mrc.sql
-- Agrega texto de exclusiones y de sub-límites a nivel de PLAN (no de cobertura individual).
-- Motivo: además de las exclusiones ya cargadas por cobertura en `coberturas_catalogo.texto_exclusiones`
-- (migración 012), el sistema real muestra un bloque de exclusiones generales de la póliza y un
-- bloque de sub-límites "a primer riesgo absoluto" en el detalle de la cotización — texto dictado
-- por Kevin (2026-07-13) contra el sistema de escritorio para "MULTIRRIESGO COMERCIO - NORMAL".
--
-- Pendiente, no bloqueante: el monto de "Daños por Granizo" ya cargado en `plan_coberturas`
-- (Gs. 5.000.000, migración 012) no coincide con el texto de sub-límites dictado ahora
-- (Gs. 2.000.000) — Kevin confirmó (2026-07-13) que ese monto se usó en otra oferta puntual y
-- que el valor fijo real se define después. NO se toca `plan_coberturas` en esta migración.

ALTER TABLE planes
  ADD COLUMN texto_exclusiones_generales TEXT,
  ADD COLUMN texto_sublimites_generales TEXT;

UPDATE planes
SET texto_exclusiones_generales =
'Los riesgos que posean proceso de modificación de materia prima y que manejen material altamente combustible. Ejemplo: Panaderías, talleres mecánicos, imprentas, carpinterías, mueblerías, gomerías entre otros.
Joyas, metales preciosos, títulos y papeles, obras de arte, entre otros.
Variación de Tensión, Arcos Voltaicos.
Cuando el edificio no posee los cuatro costados cerrados se excluye la cobertura de Huracán, vendaval, ciclón o tornado.
Todas las demás exclusiones indicadas en el texto de Póliza obrante en la Web de la Compañía.
Para robo queda excluido todo artículo que no se encuentre en alguno de los edificios con los 4 laterales cerrados y techados, con las medidas de seguridad adecuadas. Se excluye además los aparatos celulares, tablets, accesorios y equipos electrónicos móviles.',
    texto_sublimites_generales =
'Sub-límites de coberturas para daños o pérdidas como consecuencia de un riesgo cubierto, a primer riesgo absoluto para:
Daños a murallas, cercos perimetrales y rejas: hasta la suma máxima de Gs. 1.000.000.- para cada vigencia.
Daños por granizo: hasta la suma máxima de Gs. 2.000.000.- por cada vigencia para daños al edificio.'
FROM ramos
WHERE planes.ramo_id = ramos.id
  AND ramos.nombre = 'mrc'
  AND planes.nombre = 'MULTIRRIESGO COMERCIO - NORMAL';
