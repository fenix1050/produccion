-- 038_seed_incendio_3_planes.sql
-- Quinta y última migración de este PR (grupo 1 del cambio "incendio-3-planes-y-moneda").
-- Alta de los 3 planes nuevos de Incendio con mecánica `objeto_riesgo` (migración 035):
-- "Incendio Hipotecario", "Incendio con Inspección", "Incendio sin Inspección" —
-- ver openspec/changes/incendio-3-planes-y-moneda/specs/incendio-planes-objeto-riesgo/spec.md.
--
-- Desviación puntual de design.md: la spec "Hipotecario legal content" exige que las 5
-- cláusulas legales obligatorias del plan queden asociadas a ESE plan específicamente como
-- datos estructurados y recuperables al leer la data del plan — no como texto libre que
-- cualquier agente pueda (des)seleccionar por cotización, que es la semántica actual de
-- `clausulas_catalogo` (catálogo por RAMO, elegido a mano en `cotizacion_clausulas`).
-- `clausulas_catalogo` no tenía forma de decir "esta cláusula es obligatoria de este plan".
-- Se agrega acá `plan_id BIGINT NULL REFERENCES planes(id)` (aditiva, nullable, mismo patrón
-- ya usado en 036 para `tasas_riesgo_objeto.plan_id`): NULL preserva el significado actual
-- ("cláusula de catálogo general del ramo, seleccionable por cotización"); un valor no-NULL
-- marca "cláusula obligatoria de ESE plan". No se tocan las filas existentes (quedan NULL).
ALTER TABLE clausulas_catalogo
  ADD COLUMN plan_id BIGINT NULL REFERENCES planes(id);

-- ============ PLANES ============
-- prima_tecnica_minima / responsabilidad_maxima_cotizable / descuento_maximo / recargo_maximo
-- quedan SIN CARGAR a propósito (mismo criterio que "INCENDIO - EDIFICIO Y CONTENIDO" en la
-- migración 013): las tasas de tipos de riesgo distintos de VIVIENDA FAMILIAR y estos pisos
-- están pendientes de confirmación de Kevin (semana del 2026-08-03, ver proposal.md
-- "Dependencies"). `monedas_permitidas` queda en el DEFAULT `{PYG}` (migración 034): no hay
-- confirmación de que estos 3 planes coticen en USD.
--
-- `umbral_inspeccion_monto` / `umbral_inspeccion_moneda` quedan NULL a propósito — el monto
-- final del umbral (~USD 700.000) todavía no está confirmado. Es un estado transitorio
-- documentado y esperado (ver design.md "Migration / Rollout"): mientras esté NULL, la regla
-- de umbral no bloquea ninguna cotización (la validación real llega en el PR 2, grupo 3).
-- `requiere_inspeccion` SÍ se carga ahora porque es un dato estructural del plan (a qué lado de
-- la regla pertenece), no un monto pendiente de tarifación.
INSERT INTO planes (ramo_id, nombre, tipo_mecanica, requiere_inspeccion, activo)
SELECT id, 'INCENDIO HIPOTECARIO', 'objeto_riesgo', NULL, TRUE
FROM ramos WHERE nombre = 'incendio';

INSERT INTO planes (ramo_id, nombre, tipo_mecanica, requiere_inspeccion, activo)
SELECT id, 'INCENDIO CON INSPECCION', 'objeto_riesgo', TRUE, TRUE
FROM ramos WHERE nombre = 'incendio';

INSERT INTO planes (ramo_id, nombre, tipo_mecanica, requiere_inspeccion, activo)
SELECT id, 'INCENDIO SIN INSPECCION', 'objeto_riesgo', FALSE, TRUE
FROM ramos WHERE nombre = 'incendio';

-- ============ CATÁLOGO DE COBERTURAS — OBJETOS DE RIESGO ============
-- 'incendio_edificio' YA EXISTE (migración 013, catálogo compartido con "INCENDIO - EDIFICIO Y
-- CONTENIDO") — se reutiliza tal cual para los 3 planes nuevos, no se vuelve a insertar (mismo
-- criterio que 'incendio_maquinaria' ya compartido hoy, ver riesgo técnico en design.md). Acá
-- solo se agregan los 3 códigos que faltan: Instalaciones, Contenido Mueble y Equipos,
-- Contenido Mercadería.

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, es_opcional)
SELECT id, 'incendio_instalaciones', 'Incendio de Instalaciones', 'Coberturas Principales',
  'Incendio, Rayo y Explosión; incendio y daños materiales por Huracán, Vendaval, Ciclón y/o Tornado; Granizo; daños materiales por Impacto de Vehículos Terrestres; daños materiales por Caída de Aeronaves; incendios y/o daños materiales por Huelga y/o Tumulto Popular, "Lock out". Aplica sobre las instalaciones fijas del riesgo asegurado (eléctricas, sanitarias, de climatización u otras instalaciones fijas). Medida de prestación: a prorrata.',
  'Ídem exclusiones generales de Incendio (terrorismo/guerra, contaminación radioactiva y explosión nuclear, rotura de maquinarias, falta/deficiencia en la provisión de energía, pérdida de beneficios). Si el edificio no cuenta con los 4 laterales cerrados, se excluye la cobertura de fenómenos naturales (Huracán/Vendaval/Ciclón/Tornado) sobre estas instalaciones.',
  FALSE
FROM ramos WHERE nombre = 'incendio';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, es_opcional)
SELECT id, 'incendio_contenido_mueble_equipos', 'Incendio de Contenido Mueble y Equipos', 'Coberturas Principales',
  'Ídem riesgos cubiertos de Incendio de Edificio (ver esa cobertura), aplicados sobre el mobiliario, equipos y bienes muebles del riesgo asegurado. Medida de prestación: a prorrata.',
  'Ídem exclusiones generales de Incendio. Hurto o desaparición misteriosa y/o infidelidad de empleados y directores no están cubiertos bajo esta cobertura.',
  FALSE
FROM ramos WHERE nombre = 'incendio';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, es_opcional)
SELECT id, 'incendio_contenido_mercaderia', 'Incendio de Contenido Mercadería', 'Coberturas Principales',
  'Ídem riesgos cubiertos de Incendio de Edificio (ver esa cobertura), aplicados sobre la mercadería/existencias del riesgo asegurado. Medida de prestación: a prorrata.',
  'Ídem exclusiones generales de Incendio.',
  FALSE
FROM ramos WHERE nombre = 'incendio';

-- ============ PLAN_COBERTURAS: los 4 objetos de riesgo son opcionales por cotización ============
-- `incluida_por_defecto = FALSE`: a diferencia de "INCENDIO - EDIFICIO Y CONTENIDO" (donde
-- Edificio y Contenido son ambos obligatorios), acá los 4 objetos son opcionales — el agente
-- declara solo los que aplican al riesgo (decisión confirmada por Kevin en proposal.md). `monto`
-- y `franquicia` quedan NULL: se declaran por cotización, no tienen default de plan.
INSERT INTO plan_coberturas (plan_id, cobertura_id, incluida_por_defecto)
SELECT p.id, c.id, FALSE
FROM planes p
JOIN coberturas_catalogo c ON c.ramo_id = p.ramo_id
CROSS JOIN (VALUES
  ('incendio_edificio'),
  ('incendio_instalaciones'),
  ('incendio_contenido_mueble_equipos'),
  ('incendio_contenido_mercaderia')
) AS objetos(codigo)
WHERE p.nombre IN ('INCENDIO HIPOTECARIO', 'INCENDIO CON INSPECCION', 'INCENDIO SIN INSPECCION')
  AND c.codigo = objetos.codigo;

-- ============ RPF PLANO (0 / 1,6 / 1,35 / 1,0) ============
-- Mismo valor plano ya confirmado por Kevin para el resto de Incendio (migración 023): no varía
-- por cantidad de cuotas, igual para los 3 planes nuevos.
INSERT INTO plan_formas_pago (plan_id, forma_pago_id, tasa_rpf, habilitada)
SELECT p.id, fp.id, v.tasa, TRUE
FROM planes p
JOIN formas_pago fp ON TRUE
CROSS JOIN (VALUES
  ('contado', 0.0),
  ('cobrador', 1.6),
  ('boca_cobranza', 1.35),
  ('tarjeta_credito', 1.0)
) AS v(codigo, tasa)
WHERE p.nombre IN ('INCENDIO HIPOTECARIO', 'INCENDIO CON INSPECCION', 'INCENDIO SIN INSPECCION')
  AND fp.codigo = v.codigo;

-- ============ TEXTO LEGAL ESTRUCTURADO — INCENDIO HIPOTECARIO ============
-- Las 5 cláusulas obligatorias confirmadas (ver specs/incendio-planes-objeto-riesgo/spec.md
-- "Hipotecario legal content"). Renderizarlas en el PDF de Carta Oferta queda fuera de alcance
-- de este cambio (gap ya conocido del ramo Incendio, ver proposal.md "Out of Scope").
INSERT INTO clausulas_catalogo (ramo_id, plan_id, nombre, texto_legal, activo)
SELECT r.id, p.id, 'Primer Riesgo Absoluto',
  'La presente póliza se contrata bajo la modalidad de Primer Riesgo Absoluto: en caso de siniestro, la Compañía indemniza el daño realmente sufrido hasta el límite de la suma asegurada contratada para cada objeto de riesgo, sin aplicar la regla proporcional (infraseguro) entre la suma asegurada y el valor real del bien al momento del siniestro.',
  TRUE
FROM ramos r, planes p
WHERE r.nombre = 'incendio' AND p.nombre = 'INCENDIO HIPOTECARIO';

INSERT INTO clausulas_catalogo (ramo_id, plan_id, nombre, texto_legal, activo)
SELECT r.id, p.id, 'Exigencia de Edificio Terminado',
  'El edificio asegurado debe encontrarse totalmente terminado, con paredes, techos y aberturas (puertas y ventanas) completos y cerrados, al momento de la contratación y durante toda la vigencia de la póliza. La Compañía se reserva el derecho de rechazar la cobertura o el pago de un siniestro si se comprueba que el edificio no cumplía esta condición al momento del hecho.',
  TRUE
FROM ramos r, planes p
WHERE r.nombre = 'incendio' AND p.nombre = 'INCENDIO HIPOTECARIO';

INSERT INTO clausulas_catalogo (ramo_id, plan_id, nombre, texto_legal, activo)
SELECT r.id, p.id, 'Exclusión de Fenómenos Naturales sin los 4 Costados',
  'Si el edificio asegurado no cuenta con los 4 costados (paredes) cerrados y terminados, queda excluida de la cobertura la indemnización por daños materiales causados por Huracán, Vendaval, Ciclón y/o Tornado, aun cuando esos riesgos estén nombrados en la cobertura de Incendio contratada.',
  TRUE
FROM ramos r, planes p
WHERE r.nombre = 'incendio' AND p.nombre = 'INCENDIO HIPOTECARIO';

INSERT INTO clausulas_catalogo (ramo_id, plan_id, nombre, texto_legal, activo)
SELECT r.id, p.id, 'Informe de Tasación',
  'La contratación de la póliza bajo el plan Incendio Hipotecario requiere un informe de tasación del inmueble/bien asegurado, realizado por un tasador aceptado por la Compañía, como condición para determinar la suma asegurada y la aceptación del riesgo.',
  TRUE
FROM ramos r, planes p
WHERE r.nombre = 'incendio' AND p.nombre = 'INCENDIO HIPOTECARIO';

INSERT INTO clausulas_catalogo (ramo_id, plan_id, nombre, texto_legal, activo)
SELECT r.id, p.id, 'Mantenimiento Eléctrico y Aviso Inmediato a la Compañía',
  'El asegurado se compromete a mantener en buen estado de funcionamiento y conservación las instalaciones eléctricas del edificio asegurado, y a dar aviso inmediato a la Compañía ante cualquier deficiencia, avería o modificación de dichas instalaciones que pueda incrementar el riesgo asegurado.',
  TRUE
FROM ramos r, planes p
WHERE r.nombre = 'incendio' AND p.nombre = 'INCENDIO HIPOTECARIO';

-- ============ TASAS POR OBJETO DE RIESGO — VIVIENDA FAMILIAR (única confirmada hoy) ============
-- Global 2,24% (mín 0,6%, máx 35,48%) desglosado: Edificio 40% → 0,90%, Instalaciones 40% →
-- 0,90%, Contenido Mueble y Equipos 60% → 1,34%, Contenido Mercadería 60% → 1,34% — valores
-- oficiales ya redondeados de Kevin (0,90 ≠ 0,896 = 40% × 2,24 sin redondear, ver design.md).
-- `plan_id NULL`: tasa genérica del tipo de riesgo, comparte entre los 3 planes nuevos
-- (confirmado que hoy comparten tasa; el override por plan queda disponible sin refactor).
INSERT INTO tipos_riesgo_incendio (ramo_id, nombre, tasa_global, tasa_minima, tasa_maxima, unidad)
SELECT id, 'VIVIENDA FAMILIAR', 2.24, 0.6, 35.48, 'porcentaje'
FROM ramos WHERE nombre = 'incendio';

INSERT INTO tasas_riesgo_objeto (tipo_riesgo_id, plan_id, objeto_riesgo, tasa_valor, factor_porcentaje, unidad)
SELECT tri.id, NULL, v.objeto, v.tasa, v.factor, 'porcentaje'
FROM tipos_riesgo_incendio tri
CROSS JOIN (VALUES
  ('edificio', 0.90, 40.00),
  ('instalaciones', 0.90, 40.00),
  ('contenido_mueble_equipos', 1.34, 60.00),
  ('contenido_mercaderia', 1.34, 60.00)
) AS v(objeto, tasa, factor)
WHERE tri.nombre = 'VIVIENDA FAMILIAR';
