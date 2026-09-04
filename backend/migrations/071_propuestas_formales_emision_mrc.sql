-- PF-3 MRC: immutable formal-proposal issuance, private artifacts, controlled text versions,
-- and an append-only audit trail. Browser roles remain default-deny through RLS.
ALTER TABLE roles
  ADD COLUMN puede_gestionar_textos_propuesta BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN puede_descargar_propuestas BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN puede_anular_propuestas BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE usuarios ADD COLUMN matricula_agente VARCHAR(80);

ALTER TABLE propuestas_formales
  ADD COLUMN numero_propuesta BIGINT UNIQUE,
  ADD COLUMN reemplaza_propuesta_id BIGINT REFERENCES propuestas_formales(id),
  ADD COLUMN motivo_anulacion TEXT,
  ADD COLUMN anulada_por INT REFERENCES usuarios(id),
  ADD COLUMN anulada_at TIMESTAMPTZ,
  ADD COLUMN emitida_por INT REFERENCES usuarios(id),
  ADD COLUMN emitida_at TIMESTAMPTZ,
  ADD COLUMN snapshot_json JSONB,
  ADD COLUMN snapshot_hash CHAR(64),
  ADD COLUMN schema_version VARCHAR(30),
  ADD COLUMN template_version VARCHAR(100),
  ADD COLUMN text_versions_json JSONB,
  ADD COLUMN pdf_storage_path TEXT,
  ADD COLUMN pdf_hash CHAR(64),
  ADD COLUMN pdf_size INT CHECK (pdf_size IS NULL OR pdf_size >= 0),
  ADD COLUMN pdf_generado_at TIMESTAMPTZ,
  ADD COLUMN ultimo_error_codigo VARCHAR(100),
  ADD COLUMN ultimo_error_at TIMESTAMPTZ;

ALTER TABLE propuestas_formales ADD CONSTRAINT propuestas_formales_emitida_completa CHECK (
  estado NOT IN ('emitida', 'anulada') OR (
    numero_propuesta IS NOT NULL AND snapshot_json IS NOT NULL AND snapshot_hash IS NOT NULL
    AND schema_version IS NOT NULL AND template_version IS NOT NULL AND text_versions_json IS NOT NULL
    AND pdf_storage_path IS NOT NULL AND pdf_hash IS NOT NULL AND pdf_size IS NOT NULL
    AND pdf_generado_at IS NOT NULL AND emitida_at IS NOT NULL AND emitida_por IS NOT NULL
  )
);

CREATE UNIQUE INDEX propuestas_formales_carta_emitida_unique
  ON propuestas_formales (carta_oferta_id) WHERE estado = 'emitida';

CREATE TABLE propuesta_correlativos (
  producto_codigo VARCHAR(50) PRIMARY KEY,
  ultimo_numero BIGINT NOT NULL DEFAULT 0 CHECK (ultimo_numero >= 0)
);

CREATE TABLE propuesta_textos (
  id BIGSERIAL PRIMARY KEY,
  producto_codigo VARCHAR(50) NOT NULL,
  clave VARCHAR(80) NOT NULL,
  version INT NOT NULL CHECK (version > 0),
  contenido TEXT NOT NULL,
  motivo TEXT NOT NULL,
  publicado BOOLEAN NOT NULL DEFAULT FALSE,
  creado_por INT REFERENCES usuarios(id),
  creado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  publicado_at TIMESTAMPTZ,
  origen VARCHAR(80) NOT NULL DEFAULT 'publicacion_administrativa' CHECK (
    origen IN ('publicacion_administrativa', 'migracion_fuente_oficial')
  ),
  UNIQUE (producto_codigo, clave, version)
);

CREATE UNIQUE INDEX propuesta_textos_publicado_unique
  ON propuesta_textos (producto_codigo, clave) WHERE publicado;

CREATE TABLE propuesta_formal_eventos (
  id BIGSERIAL PRIMARY KEY,
  propuesta_formal_id BIGINT NOT NULL REFERENCES propuestas_formales(id),
  actor_id INT NOT NULL REFERENCES usuarios(id),
  evento VARCHAR(40) NOT NULL,
  detalle JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(detalle) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.propuesta_textos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propuesta_formal_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propuesta_correlativos ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES ('propuestas-formales-privadas', 'propuestas-formales-privadas', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Initial PF-3 MRC texts are the approved, case-data-free legal content from
-- docs/insumos/Propuesta formal mrc.pdf. The migration is the author of this
-- baseline, so created_by remains NULL rather than attributing it to a user.
INSERT INTO propuesta_textos (
  producto_codigo, clave, version, contenido, motivo, publicado, publicado_at, origen
)
VALUES
  (
    'mrc',
    'coberturas_principales',
    1,
    $$Incendio, Rayo y Explosión;
Incendio y daños materiales por Huracán, Vendaval, Ciclón o Tornados;
Incendio y daños materiales por Tumulto y/o Alboroto Popular y/o Huelga que revista tales caracteres, siempre que no sean por motivos políticos;
Daños materiales por Caída de Aeronaves y/o de sus partes componentes;
Daños materiales por Impacto de vehículos terrestres de terceros;
Daños materiales por Humo y Hollín;

Robo y/o Asalto del Contenido.-
Robo (Caja registradora).-
Robo (Transito).-
Rotura de Cristales, Vidrios o Espejos.-
Responsabilidad Civil.-$$,
    'Versión inicial aprobada; fuente oficial MRC sin datos de caso.',
    TRUE,
    NOW(),
    'migracion_fuente_oficial'
  ),
  (
    'mrc',
    'declaraciones_generales',
    1,
    $$Declaro que el propósito del presente acuerdo es expresa y específicamente para asegurar el(los) bien(es) detallado(s) en esta propuesta de seguros.

Declaro bajo fe de juramento que todos los datos e informaciones contenidos en esta PROPUESTA de Seguros son ciertos y soy consciente de las consecuencias derivadas del artículo 1549 del Código Civil Paraguayo, asimismo los datos indicados son la base del contrato con ASEGURADORA TAJY PROP. COOP. S.A. DE SEGUROS (en adelante, "La Aseguradora") sujeto a sus cláusulas y condiciones que acepto en todas sus partes, comprometiéndome a pagar el Premio conforme lo pactado.

En caso de cambio de domicilio, residencia, de trabajo o modificación del riesgo, me comprometo a comunicar por escrito a la Compañía. Queda expresamente convenido que la falta de pago de una factura a su vencimiento producirá el decaimiento de los plazos establecidos en todos los demás documentos no vencidos, o cuotas pactadas, facultando a LA ASEGURADORA a exigir el pago inmediato del saldo adeudado. El simple vencimiento establecerá la mora, por lo que autorizo a LA ASEGURADORA a realizar la consulta como a la inclusión en la base de datos de informaciones confidenciales (Informconf), conforme a lo establecido en la Ley N.º 1682/01 y modificatorias.

Asimismo, autorizo por el presente instrumento en forma expresa e irrevocable, otorgando suficiente mandato de conformidad a los términos del Art. 917 Inc. a) del Código Civil, para que por propia cuenta o a través de la Superintendencia de Seguros, puedan recabar y/o proveer información en plaza referente a mi cumplimiento de pago de primas de seguros, cantidad y monto de reclamos realizados, así como mi calidad moral como asegurado, ya sea por escrito o por procedimientos informáticos. Esta autorización se extiende a fin de que pueda proveerse la información a terceros interesados.

Convengo que la vigencia del seguro comenzará desde la hora y fecha en que LA ASEGURADORA acepte el riesgo, emitiendo la Póliza respectiva. Cuando el texto de la Póliza difiera de la propuesta, la diferencia se considerará aprobada por el Tomador si no reclama dentro de un mes de haber recibido la Póliza (Artículo 1556 del Código Civil).$$,
    'Versión inicial aprobada; fuente oficial MRC sin datos de caso.',
    TRUE,
    NOW(),
    'migracion_fuente_oficial'
  ),
  (
    'mrc',
    'declaracion_jurada_origen_fondos',
    1,
    $$Declaración Jurada de Origen de Fondos

Declaro bajo fe de juramento que el dinero utilizado para el pago de la prima y el bien a asegurar provienen de fuente lícita y, por tanto, no están relacionados con dinero, capitales, bienes, haberes, valores o títulos, etc., producto o resultantes de las actividades ilícitas a las que se refiere la Ley N.º 1.015/97, sus modificatorias y otras normas sobre PLA/FT y las que hacen referencia a tales hechos. Asumiendo cualquier responsabilidad que pudiera surgir ante un eventual control que permita detectar la falsedad de lo declarado, quedando sujeto a las disposiciones legales vigentes.

Que SÍ ( ) NO ( ) poseo procesos o condenas por la comisión de los hechos punibles de lavado de activos y sus delitos precedentes y/o el financiamiento del terrorismo, figuro o he sido incluido en listas de terroristas u organizaciones terroristas emitidas por el Consejo de Seguridad de las Naciones Unidas, listas OFAC y demás listas internacionales.

Que SÍ ( ) NO ( ) realizo transferencias con países considerados como no cooperantes por el GAFI, con riesgos relacionados a LA/FT, países sujetos a sanciones por la OFAC, países sujetos a sanciones del Consejo de Seguridad de las Naciones Unidas y otros que señale la SEPRELAD.

Que SÍ ( ) NO ( ) me encuentro afectado/a, según lo establecido en las normas vigentes, como Persona Expuesta Políticamente (PEP). En caso afirmativo indicar detalladamente el motivo.

Que SÍ ( ) NO ( ) soy Sujeto Obligado de acuerdo con la Ley N.º 1.015/97, sus modificatorias y reglamentaciones vigentes. En caso afirmativo indicar detalladamente el motivo.

La firma que aparece estampada al pie de este documento fue realizada en presencia del funcionario y/o intermediario de la aseguradora, la cual pasará a formar parte del legajo personal y registros del cliente.

Electrónica c/Firma Digital ( ) Impresa c/Firma Facsimilar ( ) Impresa c/Firma Manuscrita ( )$$,
    'Versión inicial aprobada; fuente oficial MRC sin datos de caso.',
    TRUE,
    NOW(),
    'migracion_fuente_oficial'
  ),
  (
    'mrc',
    'autorizaciones_tomador_poliza_digital',
    1,
    $$1. Autorizaciones del Tomador y/o Representante Legal - En caso de opción Póliza Digital.

1.1 Mecanismos de Entrega (puede seleccionar más de una opción): Correo Electrónico ( ) Vía Teléfono Móvil ( ) Usuario Web ( )

1.2 Autorizo a Aseguradora Tajy Prop. Coop. S.A. a enviar, por los medios electrónicos indicados y declarados en la presente Solicitud, un link de descarga y/o de acceso al portal de usuario web de la compañía, donde podré acceder a los siguientes documentos:

1.2.1 Comunicaciones y documentos relativos a la presente solicitud de seguro, tales como los referentes al acuse de recepción de la misma.

1.2.2 La póliza de seguro propiamente dicha; las modificaciones y/o suplementos y/o anexos y/o cualquier otro documento relativo a la póliza de seguro en formato electrónico, las cuales estarán firmadas con el uso de la firma digital (de conformidad con lo establecido en la Ley N° 4.017/2.010 y sus posteriores versiones modificatorias, y en las resoluciones vigentes de la Superintendencia de Seguros emitidas para el efecto, cuyas copias se encuentran disponibles en www.tajy.com.py);

1.2.3 Las documentaciones remitidas vía electrónica serán consideradas como recibidas por el asegurado al momento en el cual este acceda al link de descarga y/o acceda a su usuario web de la compañía. Cuando el texto de la póliza difiera del contenido de la propuesta, la diferencia se considerará aprobada por el tomador si no reclama dentro de un mes de haber recibido la póliza (Art. 1.556 CC).$$,
    'Versión inicial aprobada; fuente oficial MRC sin datos de caso.',
    TRUE,
    NOW(),
    'migracion_fuente_oficial'
  ),
  (
    'mrc',
    'condiciones_mrc',
    1,
    $$Sub-límites de coberturas para daños o pérdidas como consecuencia de un riesgo cubierto, a primer riesgo absoluto para:

Daños a murallas, cercos perimetrales y rejas: hasta la suma máxima de Gs. 1.000.000.- para cada vigencia.
Daños por granizo: hasta la suma máxima de Gs. 5.000.000.- por cada vigencia para daños al edificio.

Franquicias:
Comercios ubicados en los departamentos de Itapúa y Alto Paraná posee 10% sobre todo y cada siniestro, mínimo de Gs. 500.000.- para la cobertura de Caída de Rayos.

Robo del contenido, valores en tránsito, valores caja fuerte, responsabilidad civil y equipos electrónicos de 10% sobre todo y cada siniestro, mínimo de Gs. 500.000.-

Exclusiones:
Los riesgos que posean proceso de modificación de materia prima y que manejen materiales altamente combustibles. Ejemplo: panaderías, talleres mecánicos, supermercados, imprentas, carpinterías, mueblerías, gomerías, entre otros.
Se excluye además los carteles.
Joyas, metales preciosos, títulos y papeles, obras de arte, entre otros.
Variación de tensión, arcos voltaicos.
Cuando el edificio no posee los cuatro costados cerrados se excluye la cobertura de huracán, vendaval, ciclón o tornado. Y si no cuenta con rejas de protección, el seguro de robo fuera del horario habitual de tareas queda excluido.
Para el seguro de robo de caja fuerte, se cubre el dinero circulante durante el horario habitual de tareas; pasado dicho horario el cliente debe depositar el efectivo en caja fuerte.
Todas las demás exclusiones indicadas en el texto de Póliza obrante en la Web de la Compañía.
La asegurada dará aviso fehaciente a la compañía de los cambios realizados al bien asegurado que agraven el riesgo (Cláusula 10 - Condiciones Generales, art. 1580 C.Civil).
Que expresamente la propuesta de seguro y el informe de inspección del riesgo forman parte integrante del presente contrato de seguro.
Forman parte integrante de esta póliza la Cláusula de Adecuación al Código Penal y la cláusula de cobranzas y el endoso de garantía.$$,
    'Versión inicial aprobada; fuente oficial MRC sin datos de caso.',
    TRUE,
    NOW(),
    'migracion_fuente_oficial'
  ),
  (
    'mrc',
    'clausula_adicional_cobranzas',
    1,
    $$CLÁUSULA ADICIONAL DE COBRANZAS

Queda expresamente convenido y el asegurado acepta y entiende que, una vez que haya acusado recibo de la póliza correspondiente, las obligaciones contractuales de ambas partes se encuentran plenamente vigentes y la falta de pago de la prima pactada, a su vencimiento, producirá el decaimiento de los plazos establecidos en todos los demás documentos no vencidos, o cuotas pactadas, facultando a LA ASEGURADORA a exigir el pago inmediato del saldo adeudado. Asimismo, el simple vencimiento de la fecha de pago en cualquiera de los documentos obligacionales establecerá la mora del asegurado, por lo que este instrumento implica la autorización expresa del asegurado para que LA ASEGURADORA pueda realizar la consulta o la inclusión del mismo en la base de datos de empresas especializadas en informaciones comerciales, conforme a lo establecido en la Ley N.º 1682/01 y modificatorias.$$,
    'Versión inicial aprobada; fuente oficial MRC sin datos de caso.',
    TRUE,
    NOW(),
    'migracion_fuente_oficial'
  )
ON CONFLICT (producto_codigo, clave, version) DO NOTHING;

CREATE OR REPLACE FUNCTION publicar_texto_propuesta(
  p_producto_codigo TEXT,
  p_clave TEXT,
  p_contenido TEXT,
  p_motivo TEXT,
  p_actor_id INT
)
RETURNS propuesta_textos
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_texto propuesta_textos%ROWTYPE;
  v_version INT;
BEGIN
  IF p_producto_codigo <> 'mrc' THEN RAISE EXCEPTION 'PRODUCTO_NO_HABILITADO'; END IF;
  IF NULLIF(BTRIM(p_contenido), '') IS NULL OR NULLIF(BTRIM(p_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'PF_TEXTO_INVALIDO';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('proposal-text:' || p_producto_codigo || ':' || p_clave));
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
  FROM propuesta_textos WHERE producto_codigo = p_producto_codigo AND clave = p_clave;
  UPDATE propuesta_textos SET publicado = FALSE
  WHERE producto_codigo = p_producto_codigo AND clave = p_clave AND publicado;
  INSERT INTO propuesta_textos (producto_codigo, clave, version, contenido, motivo, publicado, creado_por, publicado_at)
  VALUES (p_producto_codigo, p_clave, v_version, BTRIM(p_contenido), BTRIM(p_motivo), TRUE, p_actor_id, NOW())
  RETURNING * INTO v_texto;
  RETURN v_texto;
END;
$$;

CREATE OR REPLACE FUNCTION iniciar_emision_propuesta_formal(
  p_propuesta_id BIGINT,
  p_revision_esperada INT,
  p_snapshot_json JSONB,
  p_snapshot_hash TEXT,
  p_schema_version TEXT,
  p_template_version TEXT,
  p_text_versions_json JSONB,
  p_actor_id INT,
  p_es_admin BOOLEAN
)
RETURNS propuestas_formales
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_propuesta propuestas_formales%ROWTYPE;
  v_motivo TEXT;
  v_numero BIGINT;
BEGIN
  SELECT * INTO v_propuesta FROM propuestas_formales WHERE id = p_propuesta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PF_BORRADOR_NO_ENCONTRADO'; END IF;
  PERFORM pg_advisory_xact_lock(v_propuesta.carta_oferta_id);
  v_motivo := motivo_ineligibilidad_carta_propuesta(v_propuesta.carta_oferta_id, p_actor_id, p_es_admin);
  IF v_motivo IS NOT NULL THEN RAISE EXCEPTION '%', v_motivo; END IF;
  IF v_propuesta.estado = 'emitida' THEN RAISE EXCEPTION 'PF_PROPUESTA_YA_EMITIDA'; END IF;
  IF v_propuesta.estado NOT IN ('borrador', 'error_pdf') THEN RAISE EXCEPTION 'PF_EMISION_EN_PROGRESO'; END IF;
  IF v_propuesta.revision <> p_revision_esperada THEN RAISE EXCEPTION 'PF_REVISION_CONFLICT'; END IF;
  IF v_propuesta.cotizacion_variante_id IS NULL OR v_propuesta.cotizacion_plan_pago_id IS NULL THEN
    RAISE EXCEPTION 'PF_SELECCION_INVALIDA';
  END IF;
  IF jsonb_typeof(p_snapshot_json) <> 'object' OR jsonb_typeof(p_text_versions_json) <> 'object' THEN
    RAISE EXCEPTION 'PF_SNAPSHOT_INVALIDO';
  END IF;
  IF v_propuesta.numero_propuesta IS NULL THEN
    INSERT INTO propuesta_correlativos (producto_codigo, ultimo_numero) VALUES ('mrc', 1)
    ON CONFLICT (producto_codigo) DO UPDATE SET ultimo_numero = propuesta_correlativos.ultimo_numero + 1
    RETURNING ultimo_numero INTO v_numero;
  ELSE
    v_numero := v_propuesta.numero_propuesta;
  END IF;
  UPDATE propuestas_formales
  SET estado = 'generando_pdf', numero_propuesta = v_numero,
      reemplaza_propuesta_id = COALESCE(reemplaza_propuesta_id, (
        SELECT id FROM propuestas_formales
        WHERE carta_oferta_id = v_propuesta.carta_oferta_id AND estado = 'anulada'
        ORDER BY anulada_at DESC NULLS LAST, id DESC LIMIT 1
      )),
      snapshot_json = CASE WHEN v_propuesta.estado = 'error_pdf' THEN snapshot_json ELSE p_snapshot_json END,
      snapshot_hash = CASE WHEN v_propuesta.estado = 'error_pdf' THEN snapshot_hash ELSE p_snapshot_hash END,
      schema_version = CASE WHEN v_propuesta.estado = 'error_pdf' THEN schema_version ELSE p_schema_version END,
      template_version = CASE WHEN v_propuesta.estado = 'error_pdf' THEN template_version ELSE p_template_version END,
      text_versions_json = CASE WHEN v_propuesta.estado = 'error_pdf' THEN text_versions_json ELSE p_text_versions_json END,
      ultimo_error_codigo = NULL, ultimo_error_at = NULL,
      updated_at = NOW()
  WHERE id = v_propuesta.id
  RETURNING * INTO v_propuesta;
  INSERT INTO propuesta_formal_eventos (propuesta_formal_id, actor_id, evento, detalle)
  VALUES (v_propuesta.id, p_actor_id, 'emision_iniciada', jsonb_build_object('numero_propuesta', v_numero));
  RETURN v_propuesta;
END;
$$;

CREATE OR REPLACE FUNCTION proteger_propuesta_formal_emitida()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.estado = 'anulada' AND NEW.estado IS DISTINCT FROM OLD.estado THEN
    RAISE EXCEPTION 'Una Propuesta Formal anulada no puede cambiar de estado';
  END IF;
  IF OLD.estado = 'emitida' AND NEW.estado NOT IN ('emitida', 'anulada') THEN
    RAISE EXCEPTION 'Una Propuesta Formal emitida solo puede anularse';
  END IF;
  IF OLD.estado IN ('emitida', 'anulada') AND (
    OLD.numero_propuesta IS DISTINCT FROM NEW.numero_propuesta
    OR OLD.reemplaza_propuesta_id IS DISTINCT FROM NEW.reemplaza_propuesta_id
    OR OLD.emitida_por IS DISTINCT FROM NEW.emitida_por OR OLD.emitida_at IS DISTINCT FROM NEW.emitida_at
    OR OLD.snapshot_json IS DISTINCT FROM NEW.snapshot_json OR OLD.snapshot_hash IS DISTINCT FROM NEW.snapshot_hash
    OR OLD.schema_version IS DISTINCT FROM NEW.schema_version OR OLD.template_version IS DISTINCT FROM NEW.template_version
    OR OLD.text_versions_json IS DISTINCT FROM NEW.text_versions_json OR OLD.pdf_storage_path IS DISTINCT FROM NEW.pdf_storage_path
    OR OLD.pdf_hash IS DISTINCT FROM NEW.pdf_hash OR OLD.pdf_size IS DISTINCT FROM NEW.pdf_size
    OR OLD.pdf_generado_at IS DISTINCT FROM NEW.pdf_generado_at OR OLD.draft_json IS DISTINCT FROM NEW.draft_json
    OR OLD.cotizacion_variante_id IS DISTINCT FROM NEW.cotizacion_variante_id
    OR OLD.cotizacion_plan_pago_id IS DISTINCT FROM NEW.cotizacion_plan_pago_id
    OR (OLD.estado = 'anulada' AND (
      OLD.motivo_anulacion IS DISTINCT FROM NEW.motivo_anulacion
      OR OLD.anulada_por IS DISTINCT FROM NEW.anulada_por OR OLD.anulada_at IS DISTINCT FROM NEW.anulada_at
    ))
  ) THEN RAISE EXCEPTION 'Los snapshots y artefactos de Propuesta Formal emitidos son inmutables'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER propuestas_formales_proteger_emitidas
BEFORE UPDATE ON propuestas_formales
FOR EACH ROW EXECUTE FUNCTION proteger_propuesta_formal_emitida();

CREATE OR REPLACE FUNCTION actualizar_snapshot_emision_propuesta_formal(
  p_propuesta_id BIGINT, p_snapshot_json JSONB, p_snapshot_hash TEXT
)
RETURNS propuestas_formales
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_propuesta propuestas_formales%ROWTYPE;
BEGIN
  UPDATE propuestas_formales
  SET snapshot_json = p_snapshot_json, snapshot_hash = p_snapshot_hash, updated_at = NOW()
  WHERE id = p_propuesta_id AND estado = 'generando_pdf'
  RETURNING * INTO v_propuesta;
  IF NOT FOUND THEN RAISE EXCEPTION 'PF_EMISION_EN_PROGRESO'; END IF;
  RETURN v_propuesta;
END;
$$;

CREATE OR REPLACE FUNCTION confirmar_emision_propuesta_formal(
  p_propuesta_id BIGINT,
  p_pdf_storage_path TEXT,
  p_pdf_hash TEXT,
  p_pdf_size INT,
  p_actor_id INT
)
RETURNS propuestas_formales
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_propuesta propuestas_formales%ROWTYPE;
BEGIN
  UPDATE propuestas_formales
  SET estado = 'emitida', pdf_storage_path = p_pdf_storage_path, pdf_hash = p_pdf_hash,
      pdf_size = p_pdf_size, pdf_generado_at = NOW(), emitida_por = p_actor_id,
      emitida_at = NOW(), updated_at = NOW()
  WHERE id = p_propuesta_id AND estado = 'generando_pdf'
  RETURNING * INTO v_propuesta;
  IF NOT FOUND THEN RAISE EXCEPTION 'PF_EMISION_EN_PROGRESO'; END IF;
  INSERT INTO propuesta_formal_eventos (propuesta_formal_id, actor_id, evento, detalle)
  VALUES (v_propuesta.id, p_actor_id, 'emitida', jsonb_build_object('numero_propuesta', v_propuesta.numero_propuesta));
  RETURN v_propuesta;
END;
$$;

CREATE OR REPLACE FUNCTION registrar_error_emision_propuesta_formal(
  p_propuesta_id BIGINT, p_error_codigo TEXT, p_actor_id INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE propuestas_formales SET estado = 'error_pdf', ultimo_error_codigo = LEFT(COALESCE(p_error_codigo, 'pdf_generation_failed'), 100), ultimo_error_at = NOW(), updated_at = NOW()
  WHERE id = p_propuesta_id AND estado = 'generando_pdf';
  IF FOUND THEN
    INSERT INTO propuesta_formal_eventos (propuesta_formal_id, actor_id, evento, detalle)
    VALUES (p_propuesta_id, p_actor_id, 'emision_error', jsonb_build_object('code', LEFT(COALESCE(p_error_codigo, 'pdf_generation_failed'), 100)));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION anular_propuesta_formal(
  p_propuesta_id BIGINT, p_motivo TEXT, p_actor_id INT, p_autorizado BOOLEAN
)
RETURNS propuestas_formales
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_propuesta propuestas_formales%ROWTYPE;
BEGIN
  IF NOT COALESCE(p_autorizado, FALSE) THEN RAISE EXCEPTION 'PF_ANULACION_SIN_PERMISO'; END IF;
  IF NULLIF(BTRIM(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'PF_MOTIVO_ANULACION_REQUERIDO'; END IF;
  UPDATE propuestas_formales
  SET estado = 'anulada', motivo_anulacion = BTRIM(p_motivo), anulada_por = p_actor_id,
      anulada_at = NOW(), updated_at = NOW()
  WHERE id = p_propuesta_id AND estado = 'emitida'
  RETURNING * INTO v_propuesta;
  IF NOT FOUND THEN RAISE EXCEPTION 'PF_ANULACION_INVALIDA'; END IF;
  INSERT INTO propuesta_formal_eventos (propuesta_formal_id, actor_id, evento, detalle)
  VALUES (v_propuesta.id, p_actor_id, 'anulada', jsonb_build_object('motivo', BTRIM(p_motivo)));
  RETURN v_propuesta;
END;
$$;

REVOKE EXECUTE ON FUNCTION publicar_texto_propuesta(TEXT, TEXT, TEXT, TEXT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION iniciar_emision_propuesta_formal(BIGINT, INT, JSONB, TEXT, TEXT, TEXT, JSONB, INT, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION actualizar_snapshot_emision_propuesta_formal(BIGINT, JSONB, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION confirmar_emision_propuesta_formal(BIGINT, TEXT, TEXT, INT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION registrar_error_emision_propuesta_formal(BIGINT, TEXT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION anular_propuesta_formal(BIGINT, TEXT, INT, BOOLEAN) FROM PUBLIC;
