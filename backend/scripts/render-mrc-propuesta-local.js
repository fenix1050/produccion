import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  getTajyLogoDataUri,
  ProposalFitOverflowError,
  renderPropuestaMrcPdf,
  waitForProposalFit,
} from '../src/services/propuesta-pdf.service.js'
import { closeBrowser, getBrowser } from '../src/templates/oferta/pdf-utils.js'
import { buildMrcPropuestaHtml } from '../src/templates/propuesta/mrc.js'

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url))
const TMP_DIRECTORY = resolve(SCRIPT_DIRECTORY, '..', 'tmp')

export function resolveLocalOutputPath(output) {
  if (typeof output !== 'string' || !output || isAbsolute(output)) {
    throw new Error('Output path must be a non-empty relative path below backend/tmp.')
  }

  const segments = output.split(/[\\/]+/)
  const outputPath = resolve(SCRIPT_DIRECTORY, '..', output)
  const pathBelowTmp = relative(TMP_DIRECTORY, outputPath)
  const isInsideTmp =
    pathBelowTmp &&
    pathBelowTmp !== '..' &&
    !pathBelowTmp.startsWith(`..${sep}`) &&
    !isAbsolute(pathBelowTmp)

  if (segments.includes('..') || !isInsideTmp) {
    throw new Error('Output path must be a non-empty relative path below backend/tmp.')
  }

  return outputPath
}

function shortFixture() {
  return {
    proposal: {
      numero_propuesta: 17,
      emitida_at: '2026-09-02T12:00:00.000Z',
      agente: { nombre: 'Agente de Prueba', matricula: 'MAT-017' },
    },
    carta: {
      render_context: { timezone: 'America/Asuncion', locale: 'es-PY' },
      riesgo_datos: { direccion: 'Calle de Prueba 123', ciudad: 'Asunción' },
      coberturas: [{ nombre_snapshot: 'Incendio de contenido', monto: 1000000, franquicia: null }],
    },
    commercial: {
      variante: { prima: 100000 },
      plan_pago: {
        formas_pago: { codigo: 'tarjeta_credito', nombre_display: 'Tarjeta de Crédito' },
        rpf_monto: 1000,
        iva_monto: 10100,
        premio_total: 111100,
        monto_inicial: 111100,
        monto_cuota: 0,
      },
    },
    draft: {
      partes: {
        tomador_igual_asegurado: true,
        asegurado: {
          tipo_persona: 'juridica',
          nombre_razon_social: 'Comercio Sintético S.A.',
          documento: '80000001-0',
          ruc: '80000001-0',
          direccion: 'Calle de Prueba 123',
          ciudad: 'Asunción',
          telefono: '021 000 000',
          email: 'contacto@ejemplo.local',
        },
      },
      pla_ft: {},
      tipo_firma: 'manual',
      descripcion_detallada: 'Local comercial destinado a venta minorista.',
    },
    texts: {
      declaraciones_generales: { contenido: 'Texto declarativo sintético aprobado.' },
      declaracion_jurada_origen_fondos: {
        contenido: 'Declaración Jurada de Origen de Fondos\nTexto sintético de origen de fondos.',
      },
      autorizaciones_tomador_poliza_digital: {
        contenido: 'Autorización sintética de entrega digital.',
      },
      coberturas_principales: { contenido: 'Coberturas sintéticas incluidas en la propuesta.' },
      condiciones_mrc: { contenido: 'Condiciones sintéticas de la propuesta.' },
      clausula_adicional_cobranzas: {
        contenido: 'CLÁUSULA ADICIONAL DE COBRANZAS\nCláusula sintética de cobranzas.',
      },
    },
  }
}

function referenceLengthFixture() {
  return {
    proposal: {
      numero_propuesta: 18,
      emitida_at: '2026-09-02T12:00:00.000Z',
      agente: { nombre: 'Agente de Prueba', matricula: 'MAT-018' },
    },
    carta: {
      render_context: { timezone: 'America/Asuncion', locale: 'es-PY' },
      riesgo_datos: {
        direccion: 'Av. Comercial 450',
        ciudad: 'Asunción',
      },
      coberturas: [
        { nombre_snapshot: 'Incendio de edificio', monto: 350000000, franquicia: null },
        { nombre_snapshot: 'Incendio de contenido', monto: 250000000, franquicia: null },
        { nombre_snapshot: 'Robo de contenido', monto: 60000000, franquicia: 3000000 },
        { nombre_snapshot: 'Responsabilidad civil', monto: 100000000, franquicia: 2500000 },
      ],
    },
    commercial: {
      variante: { prima: 3850000 },
      plan_pago: {
        formas_pago: { codigo: 'tarjeta_credito', nombre_display: 'Tarjeta de Crédito' },
        rpf_monto: 39000,
        iva_monto: 388900,
        premio_total: 4277900,
        monto_inicial: 4277900,
        monto_cuota: 0,
      },
    },
    draft: {
      partes: {
        tomador_igual_asegurado: true,
        asegurado: {
          tipo_persona: 'juridica',
          nombre_razon_social: 'Comercial Referencia Local S.A.',
          documento: '80000002-8',
          ruc: '80000002-8',
          nacionalidad: 'Paraguaya',
          direccion: 'Av. Comercial 450, Barrio Centro',
          ciudad: 'Asunción',
          telefono: '021 000 018',
          email: 'seguros@referencia-local.test',
          ocupacion: 'Comercio minorista',
          ingreso_mensual: 125000000,
          lugar_trabajo: 'Casa matriz',
        },
      },
      pla_ft: { proveedor_estado: false, es_pep: false },
      tipo_firma: 'manual',
      descripcion_detallada:
        'Local comercial de venta minorista, con edificio de material, contenido, mercaderías, mobiliario y equipos electrónicos declarados para la actividad asegurada.',
      observaciones:
        'La aceptación queda sujeta a inspección, verificación de datos declarados y condiciones particulares de la póliza.',
    },
    texts: {
      declaraciones_generales: {
        contenido: `DECLARACIONES:

Declaro que el propósito del presente acuerdo es expresa y específicamente para asegurar el(los) bien(es) detallado(s) en esta propuesta de seguros

Declaro bajo fe de juramento que todos los datos e informaciones contenidos en esta PROPUESTA de Seguros son ciertos y soy consciente de las consecuencias derivadas del artículo 1549 del Código Civil Paraguayo, asimismo los datos indicados son la base del contrato con ASEGURADORA TAJY PROP. COOP. S.A. DE SEGUROS (En adelante "La Aseguradora") sujeto a sus cláusulas y Condiciones que acepto en todas sus partes, comprometiéndome a pagar el Premio conforme lo pactado. En caso de cambio de domicilio residencia, de trabajo o modificación del riesgo, me comprometo a comunicar por escrito a la Compañía.- Queda expresamente convenido que la falta de pago de una factura a su vencimiento, producirá el decaimiento de los plazos establecidos en todos los demás documentos no vencidos, o cuotas pactadas facultando a LA ASEGURADORA, a exigir el pago inmediato del saldo adeudado. El simple vencimiento establecerá la mora, por lo que autorizo a LA ASEGURADORA a realizar la consulta como a la inclusión en la base de datos de informaciones confidenciales (Informconf), conforme a lo establecido en la Ley No. 1682/01 y modificatorias. Asimismo, autorizo por el presente instrumento en forma expresa e irrevocable, otorgando suficiente mandato de conformidad a los términos del Art. 917 Inc. a) del Código Civil Paraguayo, para que por propia cuenta o a través de la Superintendencia de Seguros, puedan recabar y/o proveer información en plaza referente a mi cumplimiento de pago de primas de seguros, cantidad y monto de reclamos realizados, así como mi calidad moral como asegurado, ya sea por escrito o por procedimientos informáticos. Esta autorización se extiende a fin de que pueda proveerse la información a terceros interesados. Convengo que la vigencia del seguro comenzará desde la hora y fecha en que LA ASEGURADORA acepte el Riesgo, emitiendo la Póliza respectiva.- Cuando el texto de la Póliza difiera de la propuesta, la diferencia se considerará aprobada por el Tomador si no reclama dentro de un mes de haber recibido la Póliza. (Artículo 1556 del Código Civil).-`,
      },
      declaracion_jurada_origen_fondos: {
        contenido: `Declaración Jurada de Origen de Fondos
Declaro bajo fe de juramento que el dinero utilizado para el pago de la prima y el bien a asegurar, provienen de fuente lícita y por tanto no están relacionados con dinero, capitales, bienes, haberes, valores o títulos, etc. producto o resultantes de las actividades ilícitas a las que se refiere la Ley Nº 1.015/97, sus modificatorias y otras normas sobre PLA/FT y las que hacen referencia a tales hechos. Asumiendo cualquier responsabilidad que pudiera surgir ante un eventual control que permita detectar la falsedad de lo declarado, quedando sujeto a las disposiciones legales vigentes. -

* Que SI (    ) NO (    ) poseo procesos o condenas por la comisión de los hechos punibles de lavado de activos y sus delitos precedentes y/o el financiamiento del terrorismo, figuro o he sido incluido en listas de terroristas u organizaciones terroristas emitidas por el Consejo de Seguridad de las Naciones Unidas, listas OFAC y demás listas internacionales. -

* Como así también SI (     ) NO (     ) realizo transferencias con países considerados como no cooperantes por el GAFI, con riesgos relacionados a LA/FT, países sujetos a sanciones por la OFAC, países sujetos a sanciones del Consejo de Seguridad de las Naciones Unidas y otros que señale la SEPRELAD. -

* Que SI (    ) NO (    ) me encuentro afectado/a, según lo establecido en las normas vigentes, como Personas Expuestas Políticamente PEP's. En caso afirmativo indicar detalladamente el motivo: ________________________. -

* Que SI (    ) NO (    ) soy Sujeto Obligado de acuerdo a la Ley Nº 1.015/97, sus modificatorias y reglamentaciones vigentes. En caso afirmativo indicar detalladamente el motivo: ____________________________. -

La firma que aparece estampada al pie de este documento, fue realizada en presencia del funcionario y/o en la del intermediario de la aseguradora, la cual pasará a formar parte del legajo personal y registros del cliente. -

Electrónica c/Firma Digital (       )               Impresa c/Firma Facsimilar (     )                   Impresa c/Firma Manuscrita (    )`,
      },
      autorizaciones_tomador_poliza_digital: {
        contenido: `1. Autorizaciones del Tomador y/o Representante Legal - En caso de opción Póliza Digital.

1.1 Mecanismos de Entrega (puede seleccionar más de una opción)

Correo Electrónico (      )       Vía Teléfono Móvil (     )           Usuario Web (      )

1.2 Autorizo a Aseguradora Tajy Prop. Coop. S.A., a enviar por los medios electrónicos indicados y declarados en la presente Solicitud un link de descarga y/o de acceso al portal de usuario web de la compañía, donde podré acceder a los siguientes documentos:

1.2.1 Comunicaciones y documentos relativos a la presente solicitud de seguro (tales como los referentes al acuse de recepción de la misma);

1.2.2 La póliza de seguro propiamente dicha; las modificaciones y/o suplementos y/o anexos y/o cualquier otro documento relativo a la póliza de seguro en formato electrónico, las cuales estarán firmadas con el uso de la firma digital (de conformidad con lo establecido en la Ley N° 4.017/2.010 y sus posteriores versiones modificatorias, y en las resoluciones vigentes de la Superintendencia de Seguros emitidas para el efecto, cuyas copias se encuentran disponibles en www.tajy.com.py <http://www.tajy.com.py>);

1.2.3 Las documentaciones remitidas vía electrónica serán consideradas como recibidas por el asegurado al momento en el cual este acceda al link de descarga y/o acceda a su usuario web de la compañía. Cuando el texto de la póliza difiera del contenido de la propuesta, la diferencia se considerará aprobada por el tomador si no reclama dentro de un mes de haber recibido la póliza. (Art. 1.556 CC).`,
      },
      coberturas_principales: {
        contenido: `Coberturas Principales:

Incendio, Rayo y Explosión;
Incendio y daños materiales por Huracán, Vendaval, Ciclón o Tornados;
Incendio y daños materiales por Tumulto y/o Alboroto Popular y/o Huelga que revista tales caracteres, siempre que no sean por motivos políticos;
Daños materiales por Caída de Aeronaves y/o de sus partes componentes;
Daños materiales por Impacto de vehículos terrestres de terceros;
Daños materiales por Humo y Hollín;

Robo y/o Asalto del Contenido.-
Robo (Caja registradora).-
Robo (Transito).-
Rotura de Cristales, Vidrios o Espejos.-
Responsabilidad Civil.-

Distribución del Capital Asegurado:
Incendio
Mercaderia
Muebles, Equipos y Enseres
50%
50%

Sublimite para Circuito Cerrado de televisión (Cámaras de Seguridad): Gs. 5.000.000.-
Sublimite para Daños por agua: Gs. 2.000.000.-

Robo
Mercaderia
Equipos
Mueble
60%
10%
30%`,
      },
      condiciones_mrc: {
        contenido: `Sub-límites de coberturas para daños o pérdidas como consecuencia de un riesgo cubierto, A primer riesgo absoluto para:

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

Forman parte integrante de esta póliza la Cláusula de Adecuación al Código Penal y la cláusula de cobranzas y el endoso de garantia.`,
      },
      clausula_adicional_cobranzas: {
        contenido: `CLÁUSULA ADICIONAL DE COBRANZAS
La falta de pago de la prima, cuotas, recargos, impuestos o gastos en las fechas convenidas producirá los efectos previstos en las condiciones generales y en la normativa aplicable.
El tomador autoriza las gestiones de cobranza por los medios de contacto declarados.
Reconoce que la rehabilitación de la cobertura, cuando corresponda, requerirá la regularización de las obligaciones pendientes.
Los pagos se imputarán conforme a la liquidación vigente y a los mecanismos habilitados por la aseguradora.
La falta de recepción de un aviso no exime del cumplimiento de las obligaciones de pago asumidas.
La regularización de obligaciones vencidas no modifica los efectos que se hayan producido durante la mora.`,
      },
    },
  }
}

function officialFormFixture() {
  const fixture = referenceLengthFixture()
  fixture.proposal.numero_propuesta = 19
  fixture.proposal.agente = { nombre: 'Agente Sintético', matricula: 'MAT-019' }
  fixture.draft.partes.asegurado.nombre_razon_social = 'Comercio Sintético del Sur S.A.'
  fixture.draft.partes.asegurado.documento = '80000003-6'
  fixture.draft.partes.asegurado.ruc = '80000003-6'
  fixture.draft.partes.asegurado.email = 'polizas@comercio-sintetico.test'
  fixture.draft.partes.asegurado.telefono = '021 000 019'
  fixture.carta.riesgo_datos.direccion = 'Av. Ficticia 1900'
  fixture.draft.partes.asegurado.direccion = 'Av. Ficticia 1900, Barrio Prueba'
  fixture.draft.descripcion_detallada =
    'Local comercial sintético destinado a ventas, construido en material, con mercaderías, mobiliario y equipos declarados para la actividad asegurada.'
  fixture.draft.observaciones =
    'Fixture local: datos dinámicos sintéticos; texto legal estático conforme al formulario oficial.'
  fixture.texts = {
    declaraciones_generales: {
      contenido: `DECLARACIONES:

Declaro que el propósito del presente acuerdo es expresa y específicamente para asegurar el(los) bien(es) detallado(s) en esta propuesta de seguros

Declaro bajo fe de juramento que todos los datos e informaciones contenidos en esta PROPUESTA de Seguros son ciertos y soy consciente de las consecuencias derivadas del artículo 1549 del Código Civil Paraguayo, asimismo los datos indicados son la base del contrato con ASEGURADORA TAJY PROP. COOP. S.A. DE SEGUROS (En adelante "La Aseguradora") sujeto a sus cláusulas y Condiciones que acepto en todas sus partes, comprometiéndome a pagar el Premio conforme lo pactado. En caso de cambio de domicilio residencia, de trabajo o modificación del riesgo, me comprometo a comunicar por escrito a la Compañía.- Queda expresamente convenido que la falta de pago de una factura a su vencimiento, producirá el decaimiento de los plazos establecidos en todos los demás documentos no vencidos, o cuotas pactadas facultando a LA ASEGURADORA, a exigir el pago inmediato del saldo adeudado. El simple vencimiento establecerá la mora, por lo que autorizo a LA ASEGURADORA a realizar la consulta como a la inclusión en la base de datos de informaciones confidenciales (Informconf), conforme a lo establecido en la Ley No. 1682/01 y modificatorias. Asimismo, autorizo por el presente instrumento en forma expresa e irrevocable, otorgando suficiente mandato de conformidad a los términos del Art. 917 Inc. a) del Código Civil Paraguayo, para que por propia cuenta o a través de la Superintendencia de Seguros, puedan recabar y/o proveer información en plaza referente a mi cumplimiento de pago de primas de seguros, cantidad y monto de reclamos realizados, así como mi calidad moral como asegurado, ya sea por escrito o por procedimientos informáticos. Esta autorización se extiende a fin de que pueda proveerse la información a terceros interesados. Convengo que la vigencia del seguro comenzará desde la hora y fecha en que LA ASEGURADORA acepte el Riesgo, emitiendo la Póliza respectiva.- Cuando el texto de la Póliza difiera de la propuesta, la diferencia se considerará aprobada por el Tomador si no reclama dentro de un mes de haber recibido la Póliza. (Artículo 1556 del Código Civil).-`,
    },
    declaracion_jurada_origen_fondos: {
      contenido: `Declaración Jurada de Origen de Fondos
Declaro bajo fe de juramento que el dinero utilizado para el pago de la prima y el bien a asegurar, provienen de fuente lícita y por tanto no están relacionados con dinero, capitales, bienes, haberes, valores o títulos, etc. producto o resultantes de las actividades ilícitas a las que se refiere la Ley Nº 1.015/97, sus modificatorias y otras normas sobre PLA/FT y las que hacen referencia a tales hechos. Asumiendo cualquier responsabilidad que pudiera surgir ante un eventual control que permita detectar la falsedad de lo declarado, quedando sujeto a las disposiciones legales vigentes. -

* Que SI (    ) NO (    ) poseo procesos o condenas por la comisión de los hechos punibles de lavado de activos y sus delitos precedentes y/o el financiamiento del terrorismo, figuro o he sido incluido en listas de terroristas u organizaciones terroristas emitidas por el Consejo de Seguridad de las Naciones Unidas, listas OFAC y demás listas internacionales. -

* Como así también SI (     ) NO (     ) realizo transferencias con países considerados como no cooperantes por el GAFI, con riesgos relacionados a LA/FT, países sujetos a sanciones por la OFAC, países sujetos a sanciones del Consejo de Seguridad de las Naciones Unidas y otros que señale la SEPRELAD. -

* Que SI (    ) NO (    ) me encuentro afectado/a, según lo establecido en las normas vigentes, como Personas Expuestas Políticamente PEP's. En caso afirmativo indicar detalladamente el motivo: ________________________. -

* Que SI (    ) NO (    ) soy Sujeto Obligado de acuerdo a la Ley Nº 1.015/97, sus modificatorias y reglamentaciones vigentes. En caso afirmativo indicar detalladamente el motivo: ____________________________. -

La firma que aparece estampada al pie de este documento, fue realizada en presencia del funcionario y/o en la del intermediario de la aseguradora, la cual pasará a formar parte del legajo personal y registros del cliente. -

Electrónica c/Firma Digital (       )               Impresa c/Firma Facsimilar (     )                   Impresa c/Firma Manuscrita (    )`,
    },
    autorizaciones_tomador_poliza_digital: {
      contenido: `1. Autorizaciones del Tomador y/o Representante Legal - En caso de opción Póliza Digital.

1.1 Mecanismos de Entrega (puede seleccionar más de una opción)

Correo Electrónico (      )       Vía Teléfono Móvil (     )           Usuario Web (      )

1.2 Autorizo a Aseguradora Tajy Prop. Coop. S.A., a enviar por los medios electrónicos indicados y declarados en la presente Solicitud un link de descarga y/o de acceso al portal de usuario web de la compañía, donde podré acceder a los siguientes documentos:

1.2.1 Comunicaciones y documentos relativos a la presente solicitud de seguro (tales como los referentes al acuse de recepción de la misma);

1.2.2 La póliza de seguro propiamente dicha; las modificaciones y/o suplementos y/o anexos y/o cualquier otro documento relativo a la póliza de seguro en formato electrónico, las cuales estarán firmadas con el uso de la firma digital (de conformidad con lo establecido en la Ley N° 4.017/2.010 y sus posteriores versiones modificatorias, y en las resoluciones vigentes de la Superintendencia de Seguros emitidas para el efecto, cuyas copias se encuentran disponibles en www.tajy.com.py <http://www.tajy.com.py>);

1.2.3 Las documentaciones remitidas vía electrónica serán consideradas como recibidas por el asegurado al momento en el cual este acceda al link de descarga y/o acceda a su usuario web de la compañía. Cuando el texto de la póliza difiera del contenido de la propuesta, la diferencia se considerará aprobada por el tomador si no reclama dentro de un mes de haber recibido la póliza. (Art. 1.556 CC).`,
    },
    coberturas_principales: {
      contenido: `Coberturas Principales:

Incendio, Rayo y Explosión;
Incendio y daños materiales por Huracán, Vendaval, Ciclón o Tornados;
Incendio y daños materiales por Tumulto y/o Alboroto Popular y/o Huelga que revista tales caracteres, siempre que no sean por motivos políticos;
Daños materiales por Caída de Aeronaves y/o de sus partes componentes;
Daños materiales por Impacto de vehículos terrestres de terceros;
Daños materiales por Humo y Hollín;

Robo y/o Asalto del Contenido.-
Robo (Caja registradora).-
Robo (Transito).-
Rotura de Cristales, Vidrios o Espejos.-
Responsabilidad Civil.-

Distribución del Capital Asegurado:
Incendio
Mercaderia
Muebles, Equipos y Enseres
50%
50%

Sublimite para Circuito Cerrado de televisión (Cámaras de Seguridad): Gs. 5.000.000.-
Sublimite para Daños por agua: Gs. 2.000.000.-

Robo
Mercaderia
Equipos
Mueble
60%
10%
30%`,
    },
    condiciones_mrc: {
      contenido: `Sub-límites de coberturas para daños o pérdidas como consecuencia de un riesgo cubierto, A primer riesgo absoluto para:

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

Forman parte integrante de esta póliza la Cláusula de Adecuación al Código Penal y la cláusula de cobranzas y el endoso de garantia.`,
    },
    clausula_adicional_cobranzas: {
      contenido: `CLAUSULA ADICIONAL DE COBRANZAS
Queda expresamente convenido y el asegurado acepta y entiende que, una vez que haya acusado recibo de la póliza correspondiente, las obligaciones contractuales de ambas partes se encuentran plenamente vigentes y la falta de pago de la prima pactada, a su vencimiento, producirá el decaimiento de los plazos establecidos en todos los demás documentos no vencidos, o cuotas pactadas, facultando a LA ASEGURADORA a exigir el pago inmediato del saldo adeudado. Asimismo, el simple vencimiento de la fecha de pago en cualquiera de los documentos obligacionales establecerá la mora del asegurado, por lo que este instrumento implica la autorización expresa del asegurado para que LA ASEGURADORA pueda realizar la consulta o la inclusión del mismo en la base de datos de empresas especializadas en informaciones comerciales, conforme a lo establecido en la Ley No. 1682/01 y modificatorias.`,
    },
  }
  return fixture
}

function typographyStressFixture() {
  const fixture = officialFormFixture()
  fixture.proposal.numero_propuesta = 20
  fixture.proposal.agente = {
    nombre: 'Agente Sintético de Verificación Tipográfica',
    matricula: 'MAT-020-LARGA',
  }
  fixture.draft.partes.asegurado = {
    ...fixture.draft.partes.asegurado,
    nombre_razon_social: 'Comercial Sintética Extendida S.A.',
    sexo: null,
    fecha_nacimiento: null,
    estado_civil: null,
    direccion:
      'Avenida Sintética de las Pruebas de Contención 12345, Edificio Experimental, Piso 12',
    ciudad: 'Ciudad de Prueba Extendida',
    email: 'control.tipografico.extendido@empresa-sintetica.test',
    ocupacion: 'Servicios comerciales',
    lugar_trabajo: 'Centro Operativo Sintético de Verificación Documental',
  }
  fixture.draft.pla_ft = {
    proveedor_estado: null,
    es_pep: null,
    pep_institucion: null,
    pep_cargo: null,
    pep_periodo: null,
  }
  return fixture
}

function overflowProbeFixture() {
  const fixture = referenceLengthFixture()
  const repeat = (value, count) => Array.from({ length: count }, () => value).join('\n')
  fixture.draft.descripcion_detallada = repeat(fixture.draft.descripcion_detallada, 18)
  fixture.texts.declaraciones_generales.contenido = repeat(
    fixture.texts.declaraciones_generales.contenido,
    12
  )
  fixture.texts.coberturas_principales.contenido = repeat(
    fixture.texts.coberturas_principales.contenido,
    12
  )
  fixture.texts.condiciones_mrc.contenido = repeat(fixture.texts.condiciones_mrc.contenido, 12)
  fixture.texts.clausula_adicional_cobranzas.contenido = repeat(
    fixture.texts.clausula_adicional_cobranzas.contenido,
    12
  )
  return fixture
}

export function buildLocalMrcFixture(kind) {
  if (kind === 'a') return shortFixture()
  if (kind === 'b') return referenceLengthFixture()
  if (kind === 'c') return officialFormFixture()
  if (kind === 'd') return typographyStressFixture()
  if (kind === 'overflow') return overflowProbeFixture()
  throw new Error('Fixture must be "a", "b", "c", "d", or "overflow".')
}

function rect(element) {
  const bounds = element.getBoundingClientRect()
  return Object.fromEntries(
    Object.entries({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      right: bounds.right,
      bottom: bounds.bottom,
    }).map(([key, value]) => [key, Number(value.toFixed(3))])
  )
}

async function measureFixture(snapshot, { enforceFit = true } = {}) {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(
      buildMrcPropuestaHtml(snapshot, { tajyLogoDataUri: await getTajyLogoDataUri() }),
      {
        waitUntil: 'load',
      }
    )
    if (enforceFit) {
      await waitForProposalFit(page)
    } else {
      await page.waitForFunction(
        () => globalThis.document.documentElement.dataset.proposalFit !== 'pending',
        {
          timeout: 5000,
        }
      )
    }
    return await page.evaluate(`(() => {
       ${rect.toString()}
       const textRect = (element) => {
         const range = document.createRange()
         range.selectNodeContents(element)
         return rect(range)
       }
       const selectAll = (selector) => [...document.querySelectorAll(selector)]
       const metaRows = selectAll('.proposal-page--one .header-meta-row')
       const metaCells = selectAll('.proposal-page--one .header-cell')
       const insuredFields = selectAll('.proposal-page--one .insured-field')
      const secondaryCells = selectAll('.proposal-page--one .header-meta-row--secondary .header-cell')
       const digital = document.querySelector('.digital-delivery')
       const emailValue = document.querySelector('.digital-email-value')
       const riskHeadingCells = selectAll('.proposal-page--one .risk-columns--head > *')
        const signatureCells = selectAll('.proposal-page--two .signature')
        const deliveryModeCells = selectAll('.declaration-choice-group--delivery > span')
        const fitSections = selectAll('[data-fit-section]')
      const typographySelectors = {
        A_metadata: '.proposal-page--one .header-meta',
        B_insured: '.proposal-page--one .insured-panel',
        C_modality: '.proposal-page--one .modality',
        D_riskHeader: '.proposal-page--one .risk-columns--head',
        E_riskDescription: '.proposal-page--one .risk-description',
        F_declarations: '.proposal-page--one .declarations-stack',
        G_principalCoverages: '.proposal-page--one .contract-section--coverage',
        H_conditions: '.proposal-page--two .conditions-box',
        I_costPayment: '.proposal-page--two .payment-row',
        J_authorization: '.proposal-page--two .debit-authorization',
        K_collectionClause: '.proposal-page--two .collection-clause',
        L_observations: '.proposal-page--two .observations',
        M_signatures: '.proposal-page--two .signatures',
        N_footer: '.proposal-page--two .proposal-footer',
      }
      return {
        completionSignal: document.documentElement.dataset.proposalFit,
        fitMetrics: window.__proposalFitMetrics,
        fitSections: fitSections.map((element) => ({
          section: element.dataset.fitSection,
          status: element.dataset.fitStatus,
          overflow: element.dataset.fitOverflow === 'true',
          target: Number(element.dataset.fitTarget),
          minimum: Number(element.dataset.fitMinimum),
          step: Number(element.dataset.fitStep),
          final: Number(element.dataset.fitFinal),
          rect: rect(element),
          scrollHeight: element.scrollHeight,
          clientHeight: element.clientHeight,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        })),
        typography: Object.fromEntries(Object.entries(typographySelectors).map(([name, selector]) => {
          const style = getComputedStyle(document.querySelector(selector))
          return [name, { family: style.fontFamily, size: style.fontSize, lineHeight: style.lineHeight }]
        })),
        cssPixelsAt96Dpi: {
          pages: selectAll('.proposal-page').map(rect),
          fixedGeometry: {
            riskColumns: getComputedStyle(document.querySelector('.risk-columns')).gridTemplateColumns,
            riskBody: rect(document.querySelector('.risk-columns--body')),
            contractStack: rect(document.querySelector('.contract-stack')),
            declarations: rect(document.querySelector('.declarations-stack')),
            principalCoverages: rect(document.querySelector('.contract-section--coverage')),
            conditions: rect(document.querySelector('.conditions-box')),
            paymentShell: rect(document.querySelector('.payment-row-shell')),
            paymentRow: rect(document.querySelector('.payment-row')),
            cost: rect(document.querySelector('.cost-box')),
            payment: rect(document.querySelector('.payment-box')),
            authorization: rect(document.querySelector('.debit-authorization')),
            collectionClause: rect(document.querySelector('.collection-clause')),
            observations: rect(document.querySelector('.observations')),
           signatures: rect(document.querySelector('.signatures')),
         },
          riskHeading: {
           cells: riskHeadingCells.map((element) => ({
             text: element.textContent.trim(),
             rect: rect(element),
             whiteSpace: getComputedStyle(element).whiteSpace,
             paddingLeft: getComputedStyle(element).paddingLeft,
             paddingRight: getComputedStyle(element).paddingRight,
           })),
           modality: {
             rect: rect(document.querySelector('.modality')),
             size: getComputedStyle(document.querySelector('.modality')).fontSize,
             weight: getComputedStyle(document.querySelector('.modality')).fontWeight,
           },
          },
          declarations: {
            motiveWritingLines: selectAll('.motive-writing-line').map(rect),
            deliveryModes: deliveryModeCells.map((element) => ({
              text: element.textContent.trim(),
              rect: rect(element),
              textRect: textRect(element),
              scrollWidth: element.scrollWidth,
              clientWidth: element.clientWidth,
            })),
          },
          signatures: signatureCells.map((element) => ({
           rect: rect(element),
           scrollWidth: element.scrollWidth,
           clientWidth: element.clientWidth,
           scrollHeight: element.scrollHeight,
           clientHeight: element.clientHeight,
           content: selectAll('.signature-label, .signature-detail')
             .filter((child) => child.closest('.signature') === element)
             .map(textRect),
         })),
          header: {
            meta: rect(document.querySelector('.proposal-page--one .header-meta')),
            primaryRow: rect(metaRows[0]),
            secondaryRow: rect(metaRows[1]),
            dash: rect(document.querySelector('.proposal-page--one .header-dash')),
            secondaryDividerX: Number(secondaryCells[0].getBoundingClientRect().right.toFixed(3)),
            secondaryPaddingLeft: getComputedStyle(secondaryCells[0]).paddingLeft,
            secondaryPaddingRight: getComputedStyle(secondaryCells[0]).paddingRight,
            cells: metaCells.map((element) => {
              const label = element.querySelector('b')
              const value = element.querySelector('span')
              return {
                rect: rect(element),
                labelRect: textRect(label),
                valueRect: textRect(value),
                fontSize: getComputedStyle(element).fontSize,
                lineHeight: getComputedStyle(element).lineHeight,
                wrapped: element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth,
              }
            }),
          },
          insured: {
            heading: {
              rect: rect(document.querySelector('.insured-panel h1')),
              textRect: textRect(document.querySelector('.insured-panel h1')),
              fontSize: getComputedStyle(document.querySelector('.insured-panel h1')).fontSize,
              lineHeight: getComputedStyle(document.querySelector('.insured-panel h1')).lineHeight,
            },
            grid: rect(document.querySelector('.insured-grid')),
            fields: insuredFields.map((element) => {
              const label = element.querySelector('b')
              const value = element.querySelector('span')
              return {
                rect: rect(element),
                labelRect: textRect(label),
                valueRect: textRect(value),
                fontSize: getComputedStyle(element).fontSize,
                lineHeight: getComputedStyle(element).lineHeight,
                wrapped: element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth,
              }
            }),
            checkboxes: selectAll('.insured-panel .check-box').map(rect),
          },
          signatureTypography: {
            cells: signatureCells.map((element) => {
              const label = element.querySelector('.signature-label')
              const details = selectAll('.signature-detail').filter(
                (child) => child.closest('.signature') === element
              )
              const labelBounds = textRect(label)
              const firstDetailBounds = textRect(details[0])
              return {
                labelFontSize: getComputedStyle(label).fontSize,
                labelLineHeight: getComputedStyle(label).lineHeight,
                detailFontSize: getComputedStyle(details[0]).fontSize,
                detailLineHeight: getComputedStyle(details[0]).lineHeight,
                configuredLabelMarginBottom: getComputedStyle(label).marginBottom,
                labelToFirstDetailGap: Number((firstDetailBounds.y - labelBounds.bottom).toFixed(3)),
              }
            }),
          },
          digitalDelivery: {
            outer: rect(digital),
            rows: selectAll('.digital-delivery-row').map(rect),
            checkboxes: selectAll('.digital-choice i').map(rect),
            emailLabel: rect(document.querySelector('.digital-email-label')),
            emailValue: rect(emailValue),
            emailBaselineY: Number(emailValue.getBoundingClientRect().bottom.toFixed(3)),
            emailLineBottomY: Number(emailValue.getBoundingClientRect().bottom.toFixed(3)),
          },
        },
      }
    })()`)
  } finally {
    await page.close()
    await closeBrowser()
  }
}

async function main() {
  const [kind, output, metricsOutput] = process.argv.slice(2)
  if (!kind || !output)
    throw new Error(
      'Usage: node scripts/render-mrc-propuesta-local.js <a|b|c|d> <output.pdf> [metrics.json] | overflow <rejection.json> [metrics.json]'
    )

  const outputPath = resolveLocalOutputPath(output)
  const metricsPath = metricsOutput ? resolveLocalOutputPath(metricsOutput) : null
  const fixture = buildLocalMrcFixture(kind)
  await mkdir(dirname(outputPath), { recursive: true })

  if (kind === 'overflow') {
    let rejection
    try {
      await renderPropuestaMrcPdf(fixture)
      throw new Error('Overflow probe unexpectedly produced PDF bytes')
    } catch (error) {
      if (!(error instanceof ProposalFitOverflowError)) throw error
      rejection = {
        accepted: false,
        code: error.code,
        fitState: error.fitState,
        fitEvidence: error.fitEvidence,
      }
    } finally {
      await closeBrowser()
    }
    await writeFile(outputPath, `${JSON.stringify(rejection, null, 2)}\n`)

    if (metricsPath) {
      await mkdir(dirname(metricsPath), { recursive: true })
      await writeFile(
        metricsPath,
        `${JSON.stringify(await measureFixture(fixture, { enforceFit: false }), null, 2)}\n`
      )
    }
    return
  }

  try {
    const pdf = await renderPropuestaMrcPdf(fixture)
    await writeFile(outputPath, pdf)
  } finally {
    await closeBrowser()
  }

  if (metricsPath) {
    await mkdir(dirname(metricsPath), { recursive: true })
    await writeFile(metricsPath, `${JSON.stringify(await measureFixture(fixture), null, 2)}\n`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
