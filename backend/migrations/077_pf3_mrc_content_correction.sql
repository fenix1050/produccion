-- PF-3 MRC content correction: publish the approved v3 legal and principal-coverage text.
-- Existing versions remain immutable; only the publication pointer moves to version 2.
BEGIN;

UPDATE propuesta_textos
SET publicado = FALSE
WHERE producto_codigo = 'mrc'
  AND clave IN (
    'coberturas_principales',
    'declaraciones_generales',
    'declaracion_jurada_origen_fondos',
    'autorizaciones_tomador_poliza_digital'
  )
  AND publicado = TRUE;

INSERT INTO propuesta_textos (
  producto_codigo, clave, version, contenido, motivo, publicado, publicado_at, origen
)
VALUES
  (
    'mrc',
    'coberturas_principales',
    2,
    $$Coberturas Principales:

Incendio de edificio y contenido, con extensión a rayo, explosión y humo conforme a las condiciones generales.

Daños materiales por huracán, vendaval, ciclón, tornado e impacto de vehículos, cuando corresponda.

Robo y asalto de contenido, mercaderías, mobiliario, equipos y enseres declarados.

Rotura de cristales, vidrios y espejos dentro de los límites contratados.

Responsabilidad civil por daños a terceros, hasta la suma asegurada indicada.$$,
    'Corrección de contenido legal y coberturas principales aprobadas para la Propuesta Formal MRC v3.',
    TRUE,
    NOW(),
    'migracion_fuente_oficial'
  ),
  (
    'mrc',
    'declaraciones_generales',
    2,
    $$Declaro que los datos consignados en esta propuesta son exactos, completos y verificables. La presente declaración constituye la base para el análisis del riesgo solicitado. Conozco que la omisión, reticencia o inexactitud relevante puede afectar la cobertura. Me obligo a comunicar cualquier modificación material del riesgo durante la vigencia. Reconozco que la aseguradora podrá requerir antecedentes y documentos complementarios. Autorizo la verificación de los datos declarados dentro de los límites legales aplicables. La aceptación definitiva queda sujeta a la evaluación técnica y administrativa correspondiente. Declaro que los bienes y actividades indicados se encuentran vinculados al giro comercial informado. Acepto las condiciones generales, particulares, anexos, límites y exclusiones aplicables. Comprendo que la póliza emitida prevalecerá como instrumento contractual definitivo. La presente propuesta no implica aceptación automática del riesgo por parte de la aseguradora.$$,
    'Corrección de contenido legal y coberturas principales aprobadas para la Propuesta Formal MRC v3.',
    TRUE,
    NOW(),
    'migracion_fuente_oficial'
  ),
  (
    'mrc',
    'declaracion_jurada_origen_fondos',
    2,
    $$Declaración Jurada de Origen de Fondos

Declaro bajo fe de juramento que los fondos destinados al pago de la prima provienen de actividades lícitas. Los fondos guardan relación con el giro comercial y la capacidad económica declarados. No provienen de actividades prohibidas ni de operaciones que contravengan la normativa vigente. Me obligo a proporcionar documentación de respaldo cuando sea requerida por la aseguradora. También la proporcionaré cuando sea requerida por una autoridad competente. Comunicaré cualquier cambio relevante en el origen, uso o disponibilidad de los fondos declarados. Declaro que la información anterior fue suministrada libremente y refleja mi situación al momento de firmar. Comprendo que la aseguradora podrá conservar esta declaración durante el plazo previsto por la normativa. Acepto que la verificación de estos datos podrá realizarse antes o después de la emisión de la póliza.$$,
    'Corrección de contenido legal y coberturas principales aprobadas para la Propuesta Formal MRC v3.',
    TRUE,
    NOW(),
    'migracion_fuente_oficial'
  ),
  (
    'mrc',
    'autorizaciones_tomador_poliza_digital',
    2,
    $$Autorizaciones del Tomador y/o Representante Legal

Autorizo la conservación de esta declaración, sus anexos y comunicaciones asociadas en soportes físicos o digitales. Acepto que la entrega de documentos por medios electrónicos se realice al correo indicado en esta propuesta. Reconozco como válidas las comunicaciones remitidas a los datos de contacto declarados y actualizados. Autorizo el envío de la póliza, endosos, avisos de pago, renovaciones y demás documentos vinculados. Acepto que la aseguradora mantenga un registro de las comunicaciones enviadas y recibidas. Me comprometo a informar de inmediato cualquier cambio de correo electrónico, domicilio o teléfono. Esta autorización no reemplaza las formalidades adicionales exigibles por ley o por el contrato. Autorizo el tratamiento de los datos necesarios para administrar esta solicitud y la relación contractual. Reconozco que la copia electrónica de los documentos se mantendrá disponible conforme a los canales habilitados. Acepto que los avisos de vencimiento se emitan con carácter informativo y no sustituyen la obligación de pago. La revocación de esta autorización deberá comunicarse por los canales formales definidos por la aseguradora.$$,
    'Corrección de contenido legal y coberturas principales aprobadas para la Propuesta Formal MRC v3.',
    TRUE,
    NOW(),
    'migracion_fuente_oficial'
  )
ON CONFLICT (producto_codigo, clave, version) DO NOTHING;

-- Reruns can encounter existing version-2 rows after the initial publication cleared them.
-- Republish those immutable rows explicitly so the migration remains idempotent.
UPDATE propuesta_textos
SET publicado = TRUE,
    publicado_at = NOW()
WHERE producto_codigo = 'mrc'
  AND clave IN (
    'coberturas_principales',
    'declaraciones_generales',
    'declaracion_jurada_origen_fondos',
    'autorizaciones_tomador_poliza_digital'
  )
  AND version = 2;

COMMIT;
