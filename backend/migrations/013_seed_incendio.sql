-- 013_seed_incendio.sql
-- Catálogo de coberturas, tasas y planes de Incendio (ramo separado de MRC y de Vida/AP — no
-- se mezcla con esos catálogos).
-- Fuentes:
--  - 4 cotizaciones REALES de Incendio ya emitidas por Aseguradora Tajy (`docs/insumos/`):
--    2026_05_28 GT S.A. (Incendio Contenido, Depósito), 2026_07_03 DISTRIBUIDORA MULTIPLES
--    PRODUCTOS (Edificio y Contenido, producción de quesos), 2026_07_08 COFUDEP (Edificio y
--    Contenido + sublímite fenómenos naturales 50% en estacionamiento), 2026_06_18 ROBIN HUT
--    HEIL (Edificio y Contenido, porqueriza, + sublímite fenómenos naturales 50%).
--  - "Version 01 - Calculo Varios.xlsx", pestaña INCENDIO: ejemplo de cálculo real (rubro
--    NEGOCIO - VIVIENDA, categoría E) que confirma el modelo "Incendio simple" = tasa por
--    rubro de actividad (tasa_edificio / tasa_contenido), la MISMA tabla `rubros_actividad` ya
--    cargada en la migración 012 para MRC (columna documentada como "usado por Incendio simple"
--    en el comentario de `004_tarifacion.sql`). No se vuelve a insertar `rubros_actividad` acá
--    — se reutiliza tal cual.
--  - Dato dictado por Kevin en sesión anterior (2026-07-10), plan "Maquinaria Básico" (Sección
--    02-01 del sistema de escritorio): moneda USD, tasa única 0,7%, responsabilidad máxima
--    asegurable Usd. 5.000.000, prima técnica mínima 100, descuento máximo 10%, recargo máximo
--    100%, RPF Contado 0 / Cobrador 1,6 / Boca de Cobranza deshabilitada / Tarjeta deshabilitada.
--    Ninguna de las 4 cotizaciones reales ni el Excel muestran este plan (todas están en Gs. y
--    usan tasa por rubro) — se carga igual porque es dato dictado directo por Kevin contra el
--    sistema real (mismo criterio que los textos legales de MRC en la migración 012), pero
--    queda anotado como no re-confirmado por una fuente independiente en esta sesión.
--  - Manual `M-08OP-GT-01, Manual de Suscripción Incendio, Hogar, Comercio y Todo Riesgo
--    Operativo v.02 301024.pdf`: es un PDF escaneado sin texto extraíble. Se intentó extracción
--    de texto normal (falló, 0 caracteres por página) y luego renderizado a imagen con
--    `pdftoppm` (poppler) para leerlo como PNG — no se pudo instalar poppler en este entorno
--    (`winget` no está disponible en esta sesión de PowerShell). No se pudo confirmar contra
--    este manual el texto legal/exclusiones completo de Incendio — se usó en su lugar el texto
--    de exclusiones tal cual aparece repetido en las 4 cotizaciones reales.
--
-- Confirmado (mismo criterio ya validado en MRC): los riesgos nombrados en el texto legal
-- (Rayo/Explosión, Huracán/Vendaval/Ciclón/Tornado, Granizo, Impacto de Vehículos, Caída de
-- Aeronaves, Tumulto/Huelga, "Lock out") son la redacción de QUÉ CUBRE la cobertura de
-- Incendio — no son coberturas cobrables por separado. Acá el catálogo separa Incendio de
-- Edificio e Incendio de Contenido porque tienen tasa y suma asegurada propias (igual que MRC).

-- ============ RUBROS DE ACTIVIDAD ============
-- No se inserta nada acá: `rubros_actividad` (49 filas, tasa_edificio/tasa_contenido por
-- categoría A-I) ya fue cargada en la migración 012 y es la tabla que usa el modelo "Incendio
-- simple" — confirmado contra la pestaña INCENDIO del Excel (ejemplo NEGOCIO - VIVIENDA,
-- categoría E: tasa_edificio 1,8‰, tasa_contenido 2,88‰, coincide exacto con la fila ya
-- cargada para esa categoría).

-- ============ CATÁLOGO DE COBERTURAS INCENDIO ============

-- Incendio de Edificio: sin deducible (confirmado en la pestaña INCENDIO del Excel, columna
-- "Deducible" = "Sin deducible"). Tasa NO se carga en tasas_cobertura_ramo para esta cobertura:
-- para el plan "Incendio simple" la tasa sale de rubros_actividad.tasa_edificio según el rubro
-- de actividad del riesgo cotizado (no es una tasa fija de catálogo, ver 004_tarifacion.sql).
INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, franquicia_default, es_opcional)
SELECT id, 'incendio_edificio', 'Incendio de Edificio', 'Coberturas Principales',
  'Incendio, Rayo y Explosión; incendio y daños materiales por Huracán, Vendaval, Ciclón y/o Tornado; Granizo; daños materiales por Impacto de Vehículos Terrestres; daños materiales por Caída de Aeronaves; incendios y/o daños materiales por Huelga y/o Tumulto Popular, "Lock out". Aplica sobre el edificio. Medida de prestación: a prorrata.',
  'Terrorismo y guerra. Contaminación radioactiva y explosión nuclear. Rotura de maquinarias. Líneas de transmisión y distribución. Falta y/o deficiencia en la provisión de energía. Pérdida de beneficios. Accidentes de trabajo. Hurto o desaparición misteriosa y/o infidelidad de empleados y directores. Documentos, inmobiliario del local. Si el edificio no cuenta con los 4 laterales cerrados, se excluye la cobertura de fenómenos naturales (Huracán/Vendaval/Ciclón/Tornado). Incendio originado por contenido de tanque de combustibles en el edificio.',
  NULL, FALSE
FROM ramos WHERE nombre = 'incendio';

-- Incendio de Contenido: deducible confirmado 10% en todo y cada siniestro, mínimo Gs. 500.000
-- (pestaña DATOS del Excel, misma cifra ya usada para MRC). Tasa: idem edificio, sale de
-- rubros_actividad.tasa_contenido según rubro, no de tasas_cobertura_ramo.
INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, franquicia_default, es_opcional)
SELECT id, 'incendio_contenido', 'Incendio de Contenido', 'Coberturas Principales',
  'Mismos riesgos cubiertos que Incendio de Edificio (ver esa cobertura), aplicados sobre el contenido/mercadería/maquinarias del riesgo asegurado.',
  'Ídem Incendio de Edificio.',
  500000, FALSE
FROM ramos WHERE nombre = 'incendio';

-- Sublímite de fenómenos naturales (visto en 2 de las 4 cotizaciones reales: COFUDEP —
-- estacionamiento, 50% de la suma asegurada, un evento al año; ROBIN HUT HEIL — general, mismo
-- 50% y misma frecuencia). El % y el sector/alcance se definen POR COTIZACIÓN, no acá: usa las
-- columnas `sublimite_porcentaje` / `tipo_aplicacion = 'sublimite'` de `cotizacion_coberturas`
-- (migración 011). Por eso no tiene tasa ni monto fijo de catálogo.
INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, es_opcional)
SELECT id, 'sublimite_fenomenos_naturales', 'Sublímite por Fenómenos Naturales', 'Sublímites',
  'A primer riesgo absoluto, sublímite dentro de la cobertura de Incendio de Edificio/Contenido para daños por fenómenos naturales (Huracán/Vendaval/Ciclón/Tornado/Granizo), hasta un porcentaje de la suma asegurada, un evento al año. Porcentaje y alcance (ej. solo sector estacionamiento) se definen por cotización.',
  TRUE
FROM ramos WHERE nombre = 'incendio';

-- Plan "Maquinaria Básico" (dato dictado por Kevin, ver nota de fuentes arriba — no visto en
-- ninguna cotización real ni en el Excel). Tasa única fija 0,7% (= 7‰), a diferencia de
-- Incendio Edificio/Contenido que tarifican por rubro de actividad.
INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, es_opcional)
SELECT id, 'incendio_maquinaria', 'Incendio de Maquinaria', 'Coberturas Principales',
  'Incendio parcial o total; Huracán; Impacto de Vehículos; Impacto de Aeronaves; Tumulto y/o Huelga; Granizo. Aplica sobre maquinaria, con cláusula "a prorrata". Exclusivo del plan "Maquinaria Básico".',
  'Ídem exclusiones generales de Incendio (terrorismo/guerra, contaminación radioactiva, rotura de maquinarias por causa propia). Detalle de exclusiones específicas de este plan no confirmado contra el manual de suscripción — ver nota de fuentes arriba (manual escaneado, sin texto extraíble, poppler no disponible en esta sesión para renderizarlo).',
  FALSE
FROM ramos WHERE nombre = 'incendio';

-- Sublímite de vandalismo hasta 50% (dato dictado por Kevin junto con "Maquinaria Básico").
-- Igual que el sublímite de fenómenos naturales: el porcentaje se aplica por cotización vía
-- `cotizacion_coberturas.sublimite_porcentaje`, acá solo se documenta el tope conocido (50%).
INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, es_opcional)
SELECT id, 'sublimite_vandalismo_maquinaria', 'Sublímite por Vandalismo (Maquinaria)', 'Sublímites',
  'A primer riesgo absoluto, sublímite dentro de la cobertura de Incendio de Maquinaria para daños por vandalismo, hasta el 50% de la suma asegurada. Exclusivo del plan "Maquinaria Básico".',
  TRUE
FROM ramos WHERE nombre = 'incendio';

-- ============ TASAS POR COBERTURA (‰, ramo Incendio) ============
-- Solo incendio_maquinaria tiene tasa fija de catálogo (0,7% = 7‰, dato dictado por Kevin).
-- incendio_edificio / incendio_contenido NO tienen fila acá a propósito: su tasa sale de
-- rubros_actividad.tasa_edificio / tasa_contenido según el rubro del riesgo cotizado.

INSERT INTO tasas_cobertura_ramo (ramo_id, cobertura_id, tasa_valor, unidad)
SELECT r.id, c.id, v.tasa, 'permil'
FROM ramos r
JOIN coberturas_catalogo c ON c.ramo_id = r.id
CROSS JOIN (VALUES
  ('incendio_maquinaria', 7.0)
) AS v(codigo, tasa)
WHERE r.nombre = 'incendio' AND c.codigo = v.codigo;

-- ============ PLANES INCENDIO ============

-- "Incendio - Edificio y Contenido": el plan que efectivamente se ve en las 4 cotizaciones
-- reales (tarifa por rubro de actividad). Nombre de trabajo — ninguna de las 4 cotizaciones ni
-- el Excel muestran el nombre exacto de este plan tal como está configurado en el sistema de
-- escritorio (a diferencia de MRC, donde Kevin confirmó el nombre contra la pantalla real).
-- prima_tecnica_minima / descuento_maximo / recargo_maximo quedan SIN CARGAR — no hay fuente
-- que los confirme todavía (mismo caso que "Comercio Protección Total" en la migración 012).
INSERT INTO planes (ramo_id, nombre, cotizacion_combinada)
SELECT id, 'INCENDIO - EDIFICIO Y CONTENIDO', FALSE
FROM ramos WHERE nombre = 'incendio';

-- RPF de "Incendio - Edificio y Contenido": NO CONFIRMADO. Las 4 cotizaciones reales muestran
-- Contado y, en 2 casos, un valor "Financiado: Inicial y N cuotas de Gs. X", pero no desglosan
-- Prima/RPF/IVA por separado — no alcanza para derivar la tasa_rpf sin adivinar. Coincide con
-- el pendiente ya registrado en docs/ESTADO_PROYECTO.md ("RPF fijo de Incendio... solicitado al
-- dpto. técnico, llega vía Excel"). No se inserta ninguna fila en plan_formas_pago para este
-- plan hasta que llegue esa confirmación.

-- Plan "Maquinaria Básico" — único con RPF y parámetros de cotizador confirmados (dictado por
-- Kevin, ver nota de fuentes). Nota de esquema: este plan se cotiza en USD y tiene un tope de
-- responsabilidad máxima asegurable (Usd. 5.000.000) — el schema actual (`planes`,
-- `coberturas_catalogo`) NO tiene columna de moneda ni de monto máximo asegurable por plan.
-- No se agrega una columna nueva acá (esta migración es solo de seed de catálogo, no de
-- schema) — queda como pendiente de decisión con Kevin si se necesita una migración de schema
-- para modelar moneda/tope máximo por plan, documentado también en ESTADO_PROYECTO.md.
INSERT INTO planes (ramo_id, nombre, prima_tecnica_minima, cotizacion_combinada, descuento_maximo, recargo_maximo, cuotas_default, cuotas_maximo)
SELECT id, 'MAQUINARIA BASICO', 100, FALSE, 10, 100, 11, 11
FROM ramos WHERE nombre = 'incendio';

INSERT INTO plan_formas_pago (plan_id, forma_pago_id, tasa_rpf, habilitada)
SELECT p.id, fp.id, v.tasa, v.habilitada
FROM planes p
JOIN formas_pago fp ON TRUE
CROSS JOIN (VALUES
  ('contado', 0.0, TRUE),
  ('cobrador', 1.6, TRUE),
  ('boca_cobranza', 0.0, FALSE),
  ('tarjeta_credito', 0.0, FALSE)
) AS v(codigo, tasa, habilitada)
WHERE p.nombre = 'MAQUINARIA BASICO' AND fp.codigo = v.codigo;

-- ============ CLÁUSULAS ============
-- Kevin mencionó tres cláusulas para Incendio/Maquinaria Básico ("a prorrata", "cobranza",
-- "inventario no presentado"), pero `clausulas_catalogo.texto_legal` es NOT NULL y solo se
-- confirmó la FRASE ("a prorrata", presente literal en las 4 cotizaciones reales) sin el texto
-- legal completo de ninguna de las tres. No se insertan filas acá para no violar el NOT NULL
-- con contenido inventado — queda pendiente conseguir el texto legal completo de cada cláusula
-- (ver ESTADO_PROYECTO.md).