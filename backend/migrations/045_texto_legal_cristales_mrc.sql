-- Completa el texto_legal de la cobertura "Rotura de Cristales, Vidrios o Espejos" (MRC),
-- que había quedado NULL desde el seed original (012_seed_mrc.sql) y por eso salía sin texto
-- en la Carta Oferta.
UPDATE coberturas_catalogo
SET texto_legal = 'Daños ocasionados por roturas, la compañía tiene opción para indemnizar el daño o reponer los vidrios, cristales y/o espejos especificados en el texto de la póliza. Se entiende por rotura toda fractura, quebradura y/o rajadura.'
WHERE codigo = 'cristales'
  AND ramo_id = (SELECT id FROM ramos WHERE nombre = 'mrc');
