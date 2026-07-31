-- Completa el texto_legal de la cobertura "Resp. Civil" (MRC), que había quedado NULL
-- desde el seed original (012_seed_mrc.sql) y por eso salía sin texto en la Carta Oferta.
-- Mismo caso que "Cristales" en 045_texto_legal_cristales_mrc.sql.
UPDATE coberturas_catalogo
SET texto_legal = 'La compañía subroga al asegurado en el pago de toda indemnización que el mismo tuviera que pagar a terceras personas siempre que ella sea la consecuencia directa de un accidente causado, por culpa o negligencia del asegurado o de personas bajo su dependencia o de las cosas fijas o móviles de que se sirve así como lo ocurrido a consecuencia de desprendimiento y/o caída de objetos instalados en el edificio de acuerdo a los principios de Responsabilidad Civil'
WHERE codigo = 'responsabilidad_civil'
  AND ramo_id = (SELECT id FROM ramos WHERE nombre = 'mrc');
