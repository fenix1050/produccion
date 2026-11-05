-- PF-3 MRC texts: align PROD with the reference published in TEST (Propuesta N.º 23 model).
-- Migrations 077/078 were applied in PROD but their texts never reached TEST, so the same version
-- number holds different content in each database. Existing versions stay immutable: for every key
-- whose published content differs from the target, publish the target as the NEXT version.
-- Idempotent: a key whose published content already equals the target is skipped.
BEGIN;

CREATE TEMP TABLE _textos_objetivo (clave VARCHAR(80) NOT NULL, contenido TEXT NOT NULL) ON COMMIT DROP;

INSERT INTO _textos_objetivo (clave, contenido)
VALUES
  (
    'declaraciones_generales',
    $$Declaro que el propósito del presente acuerdo es expresa y específicamente para asegurar el(los) bien(es) detallado(s) en esta propuesta de seguros.

Declaro bajo fe de juramento que todos los datos e informaciones contenidos en esta PROPUESTA de Seguros son ciertos y soy consciente de las consecuencias derivadas del artículo 1549 del Código Civil Paraguayo, asimismo los datos indicados son la base del contrato con ASEGURADORA TAJY PROP. COOP. S.A. DE SEGUROS (en adelante, "La Aseguradora") sujeto a sus cláusulas y condiciones que acepto en todas sus partes, comprometiéndome a pagar el Premio conforme lo pactado.

En caso de cambio de domicilio, residencia, de trabajo o modificación del riesgo, me comprometo a comunicar por escrito a la Compañía. Queda expresamente convenido que la falta de pago de una factura a su vencimiento producirá el decaimiento de los plazos establecidos en todos los demás documentos no vencidos, o cuotas pactadas, facultando a LA ASEGURADORA a exigir el pago inmediato del saldo adeudado. El simple vencimiento establecerá la mora, por lo que autorizo a LA ASEGURADORA a realizar la consulta como a la inclusión en la base de datos de informaciones confidenciales (Informconf), conforme a lo establecido en la Ley N.º 1682/01 y modificatorias.

Asimismo, autorizo por el presente instrumento en forma expresa e irrevocable, otorgando suficiente mandato de conformidad a los términos del Art. 917 Inc. a) del Código Civil, para que por propia cuenta o a través de la Superintendencia de Seguros, puedan recabar y/o proveer información en plaza referente a mi cumplimiento de pago de primas de seguros, cantidad y monto de reclamos realizados, así como mi calidad moral como asegurado, ya sea por escrito o por procedimientos informáticos. Esta autorización se extiende a fin de que pueda proveerse la información a terceros interesados.

Convengo que la vigencia del seguro comenzará desde la hora y fecha en que LA ASEGURADORA acepte el riesgo, emitiendo la Póliza respectiva. Cuando el texto de la Póliza difiera de la propuesta, la diferencia se considerará aprobada por el Tomador si no reclama dentro de un mes de haber recibido la Póliza (Artículo 1556 del Código Civil).$$
  ),
  (
    'declaracion_jurada_origen_fondos',
    $$Declaración Jurada de Origen de Fondos
Declaro bajo fe de juramento que el dinero utilizado para el pago de la prima y el bien a asegurar, provienen de fuente lícita y por tanto no están relacionados con dinero, capitales, bienes, haberes, valores o títulos, etc. producto o resultantes de las actividades ilícitas a las que se refiere la Ley Nº 1.015/97, sus modificatorias y otras normas sobre PLA/FT y las que hacen referencia a tales hechos. Asumiendo cualquier responsabilidad que pudiera surgir ante un eventual control que permita detectar la falsedad de lo declarado, quedando sujeto a las disposiciones legales vigentes. -

* Que SI (    ) NO (    ) poseo procesos o condenas por la comisión de los hechos punibles de lavado de activos y sus delitos precedentes y/o el financiamiento del terrorismo, figuro o he sido incluido en listas de terroristas u organizaciones terroristas emitidas por el Consejo de Seguridad de las Naciones Unidas, listas OFAC y demás listas internacionales. -

* Como así también SI (     ) NO (     ) realizo transferencias con países considerados como no cooperantes por el GAFI, con riesgos relacionados a LA/FT, países sujetos a sanciones por la OFAC, países sujetos a sanciones del Consejo de Seguridad de las Naciones Unidas y otros que señale la SEPRELAD. -

* Que SI (    ) NO (    ) me encuentro afectado/a, según lo establecido en las normas vigentes, como Personas Expuestas Políticamente PEP's. En caso afirmativo indicar detalladamente el motivo: ________________________. -

* Que SI (    ) NO (    ) soy Sujeto Obligado de acuerdo a la Ley Nº 1.015/97, sus modificatorias y reglamentaciones vigentes. En caso afirmativo indicar detalladamente el motivo: ____________________________. -

La firma que aparece estampada al pie de este documento, fue realizada en presencia del funcionario y/o en la del intermediario de la aseguradora, la cual pasará a formar parte del legajo personal y registros del cliente. -

Electrónica c/Firma Digital (       )               Impresa c/Firma Facsimilar (     )                   Impresa c/Firma Manuscrita (    )$$
  ),
  (
    'condiciones_mrc',
    $$Sub-límites de coberturas para daños o pérdidas como consecuencia de un riesgo cubierto, A primer riesgo absoluto para:

Daños a murallas, cercos perimetrales y rejas: hasta la suma máxima de Gs. 1.000.000.- para cada vigencia.
Daños por granizo: hasta la suma máxima de Gs. 5.000.000.- por cada vigencia para daños al edificio.

Franquicias:

Comercios ubicados en los departamentos de Itapúa y Alto Paraná posee 10% sobre todo y cada siniestro, mínimo de Gs. 500.000.- para la cobertura de Caída de Rayos.-

Robo del contenido, valores en transito, valores caja fuerte, responsabilidad civil y Equipos Electrónicos de 10% sobre todo y cada siniestro, mínimo de Gs. 500.000.-

Exclusiones:

Los riesgos que posean proceso de modificación de materia prima y que manejen materiales altamente combustible. Ejemplo: Panaderías, talleres mecánicos, supermercados, imprentas, carpinterías, mueblerías, gomerías entre otros.

Se excluye además los carteles.

Joyas, metales preciosos, títulos y papeles, obras de arte, entre otros.

Variación de Tensión, Arcos Voltaicos.

Cuando el edificio no posee los cuatro costados cerrados se excluye la cobertura de Huracán, vendaval, ciclón o tornado. Y si no cuenta con rejas de protecció el seguro de Robo fuera del horario habitual de tareas que excluido.

Para el seguro de Robo de Caja fuerte, se cubre el dinero circulante durante el horario habitual de tareas, pasado dicho horario el cliente debe depositar el efectivo en caja fuerte.

Todas las demás exclusiones indicadas en el texto de Póliza obrante en la Web de la Compañía.

La asegurada dará aviso fehaciente a la compañía de los cambios realizados al bien asegurado, que agraven el riesgo (Cláusula 10 - Condiciones Generales, art. 1580 C.Civil).-

Que expresamente la propuesta de seguro y el informe de inspección del riesgo forman parte integrante del presente contrato de seguro.-

Forman parte integrante de esta póliza la Cláusula de Adecuación al Código Penal y la cláusula de cobranzas y el endoso de garantia.$$
  ),
  (
    'autorizaciones_tomador_poliza_digital',
    $$1. Autorizaciones del Tomador y/o Representante Legal - En caso de opción Póliza Digital.

1.1 Mecanismos de Entrega (puede seleccionar más de una opción)

Correo Electrónico (      )       Vía Teléfono Móvil (     )           Usuario Web (      )

1.2 Autorizo a Aseguradora Tajy Prop. Coop. S.A., a enviar por los medios electrónicos indicados y declarados en la presente Solicitud un link de descarga y/o de acceso al portal de usuario web de la compañía, donde podré acceder a los siguientes documentos:

1.2.1 Comunicaciones y documentos relativos a la presente solicitud de seguro (tales como los referentes al acuse de recepción de la misma);

1.2.2 La póliza de seguro propiamente dicha; las modificaciones y/o suplementos y/o anexos y/o cualquier otro documento relativo a la póliza de seguro en formato electrónico, las cuales estarán firmadas con el uso de la firma digital (de conformidad con lo establecido en la Ley N° 4.017/2.010 y sus posteriores versiones modificatorias, y en las resoluciones vigentes de la Superintendencia de Seguros emitidas para el efecto, cuyas copias se encuentran disponibles en www.tajy.com.py <http://www.tajy.com.py>);

1.2.3 Las documentaciones remitidas vía electrónica serán consideradas como recibidas por el asegurado al momento en el cual este acceda al link de descarga y/o acceda a su usuario web de la compañía. Cuando el texto de la póliza difiera del contenido de la propuesta, la diferencia se considerará aprobada por el tomador si no reclama dentro de un mes de haber recibido la póliza. (Art. 1.556 CC).$$
  );

CREATE TEMP TABLE _textos_pendientes ON COMMIT DROP AS
SELECT o.clave, o.contenido
FROM _textos_objetivo o
WHERE NOT EXISTS (
  SELECT 1
  FROM propuesta_textos p
  WHERE p.producto_codigo = 'mrc'
    AND p.clave = o.clave
    AND p.publicado
    AND p.contenido = o.contenido
);

UPDATE propuesta_textos
SET publicado = FALSE
WHERE producto_codigo = 'mrc'
  AND publicado = TRUE
  AND clave IN (SELECT clave FROM _textos_pendientes);

INSERT INTO propuesta_textos (
  producto_codigo, clave, version, contenido, motivo, publicado, publicado_at, origen
)
SELECT
  'mrc',
  pe.clave,
  (
    SELECT COALESCE(MAX(version), 0) + 1
    FROM propuesta_textos
    WHERE producto_codigo = 'mrc' AND clave = pe.clave
  ),
  pe.contenido,
  'Alinear el texto de PROD con el modelo aprobado en TEST (Propuesta N.º 23).',
  TRUE,
  NOW(),
  'migracion_fuente_oficial'
FROM _textos_pendientes pe;

COMMIT;
