-- PF-3 MRC content correction: restore the approved "condiciones_mrc" paragraph structure
-- (sub-limits intro, Franquicias, Exclusiones) so it renders as separated legal blocks
-- instead of a single unstructured paragraph. Existing versions remain immutable; only the
-- publication pointer moves to version 2.
BEGIN;

UPDATE propuesta_textos
SET publicado = FALSE
WHERE producto_codigo = 'mrc'
  AND clave = 'condiciones_mrc'
  AND publicado = TRUE;

INSERT INTO propuesta_textos (
  producto_codigo, clave, version, contenido, motivo, publicado, publicado_at, origen
)
VALUES
  (
    'mrc',
    'condiciones_mrc',
    2,
    $$Sub-límites de coberturas para daños o pérdidas como consecuencia de un riesgo cubierto, a primer riesgo absoluto para:

Daños a murallas, cercos perimetrales y rejas: hasta la suma máxima de Gs. 1.000.000.- para cada vigencia. Daños por granizo: hasta la suma máxima de Gs. 5.000.000.- por cada vigencia para daños al edificio.

Franquicias:
Comercios ubicados en los departamentos de Itapúa y Alto Paraná posee 10% sobre todo y cada siniestro, mínimo de Gs. 500.000.- para la cobertura de Caída de Rayos.-

Robo del contenido, valores en tránsito, valores caja fuerte, responsabilidad civil y Equipos Electrónicos de 10% sobre todo y cada siniestro, mínimo de Gs. 500.000.-

Exclusiones:
Los riesgos que posean proceso de modificación de materia prima y que manejen materiales altamente combustible. Ejemplo: Panaderías, talleres mecánicos, supermercados, imprentas, carpinterías, mueblerías, gomerías entre otros.
Se excluye además los carteles.
Joyas, metales preciosos, títulos y papeles, obras de arte, entre otros.
Variación de Tensión, Arcos Voltaicos.
Cuando el edificio no posee los cuatro costados cerrados se excluye la cobertura de Huracán, vendaval, ciclón o tornado. Y si no cuenta con rejas de protección, el seguro de Robo fuera del horario habitual de tareas queda excluido.
Para el seguro de Robo de Caja fuerte, se cubre el dinero circulante durante el horario habitual de tareas, pasado dicho horario el cliente debe depositar el efectivo en caja fuerte.
Todas las demás exclusiones indicadas en el texto de Póliza obrante en la Web de la Compañía.
La asegurada dará aviso fehaciente a la compañía de los cambios realizados al bien asegurado, que agraven el riesgo (Cláusula 10 - Condiciones Generales, art. 1580 C.Civil).-
Que expresamente la propuesta de seguro y el informe de inspección del riesgo forman parte integrante del presente contrato de seguro.-
Forman parte integrante de esta póliza la Cláusula de Adecuación al Código Penal y la cláusula de cobranzas y el endoso de garantía$$,
    'Restauración de la estructura de párrafos (sub-límites, Franquicias, Exclusiones) provista por Kevin Ruiz para la Propuesta Formal MRC v3.',
    TRUE,
    NOW(),
    'migracion_fuente_oficial'
  )
ON CONFLICT (producto_codigo, clave, version) DO NOTHING;

-- Reruns can encounter an existing version-2 row after the initial publication cleared it.
-- Republish it explicitly so the migration remains idempotent.
UPDATE propuesta_textos
SET publicado = TRUE,
    publicado_at = NOW()
WHERE producto_codigo = 'mrc'
  AND clave = 'condiciones_mrc'
  AND version = 2;

COMMIT;
