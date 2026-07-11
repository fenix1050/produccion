-- 012_seed_mrc.sql
-- Catálogo de coberturas, tasas, rubros de actividad y planes de MRC (Multirriesgo Comercio).
-- Fuentes:
--  - "Version 01 - Calculo Varios.xlsx" (pestañas DATOS, MRC, TIPOS DE RIESGOS) — tasas ‰
--    reales por cobertura y por rubro de actividad, y el mapeo Grupo A (MRC) / Grupo B (TRO).
--  - Texto de cobertura/exclusiones real, copiado directo del sistema de escritorio actual de
--    Tajy por Kevin (2026-07-10), para los planes "Multirriesgo Comercio - Normal" y
--    "Comercio Protección Total".
-- Confirmado con Kevin: los 6 riesgos nombrados en el texto legal (Rayo/Explosión, Huracán,
-- Tumulto/Huelga, Caída de Aeronaves, Impacto de Vehículos, Humo y Hollín) son la redacción de
-- QUÉ CUBRE la cobertura de Incendio — no son 6 coberturas cobrables por separado.

-- ============ RUBROS DE ACTIVIDAD ============
-- Solo se cargan los rubros que tienen tasa_edificio/tasa_contenido confirmada en la pestaña
-- DATOS del Excel. El grupo (MRC/TRO) sale de cruzar contra la pestaña TIPOS DE RIESGOS;
-- donde el nombre no matcheaba exacto entre pestañas se dejó grupo = NULL (a confirmar) en vez
-- de adivinar: SILOS, CONSULTORIO MEDICO, CHANCHERIAS, GRANJA EN GENERAL.

INSERT INTO rubros_actividad (nombre, categoria, grupo, tasa_edificio, tasa_contenido) VALUES
  ('VIVIENDA', 'CATEGORIA A', NULL, 0.9, 1.44),
  ('BAZAR', 'CATEGORIA B', 'MRC', 1.2, 1.92),
  ('BOCA DE COBRANZAS', 'CATEGORIA B', 'MRC', 1.2, 1.92),
  ('BOUTIQUE', 'CATEGORIA B', 'MRC', 1.2, 1.92),
  ('CONSULTORIO', 'CATEGORIA B', 'MRC', 1.2, 1.92),
  ('DESPENSA', 'CATEGORIA B', 'MRC', 1.2, 1.92),
  ('BODEGA', 'CATEGORIA B', 'MRC', 1.2, 1.92),
  ('FARMACIA', 'CATEGORIA B', 'MRC', 1.2, 1.92),
  ('OFICINA ADMINISTRATIVA', 'CATEGORIA B', 'MRC', 1.2, 1.92),
  ('LIBRERIA', 'CATEGORIA B', 'MRC', 1.2, 1.92),
  ('PELUQUERIA', 'CATEGORIA B', 'MRC', 1.2, 1.92),
  ('VENTA DE COSMETICOS', 'CATEGORIA B', 'MRC', 1.2, 1.92),
  ('VENTA DE ELECTRODOMESTICOS Y/O EQUIPOS ELECTRONICOS', 'CATEGORIA B', 'MRC', 1.2, 1.92),
  ('VENTA DE PRENDAS DE VESTIR', 'CATEGORIA C', 'MRC', 1.5, 2.4),
  ('VENTA DE REPUESTOS', 'CATEGORIA C', 'MRC', 1.5, 2.4),
  ('VENTAS DE PRODUCTOS DE LIMPIEZA', 'CATEGORIA C', 'MRC', 1.5, 2.4),
  ('SILOS', 'CATEGORIA C', NULL, 1.5, 2.4),
  ('AGROVETERINARIA', 'CATEGORIA E', 'TRO', 1.8, 2.88),
  ('CENTRO MATERNAL Y ESCUELA HOGAR', 'CATEGORIA E', 'TRO', 1.8, 2.88),
  ('COMPLEJO SOCIAL', 'CATEGORIA E', 'TRO', 1.8, 2.88),
  ('FUNDACION', 'CATEGORIA E', 'TRO', 1.8, 2.88),
  ('MOTEL', 'CATEGORIA E', 'TRO', 1.8, 2.88),
  ('MUNICIPALIDAD', 'CATEGORIA E', 'TRO', 1.8, 2.88),
  ('NEGOCIO - VIVIENDA', 'CATEGORIA E', 'TRO', 1.8, 2.88),
  ('CONSULTORIO MEDICO', 'CATEGORIA F', NULL, 2, 3.2),
  ('COOPERATIVA', 'CATEGORIA F', 'TRO', 2, 3.2),
  ('HOSPITAL', 'CATEGORIA F', 'TRO', 2, 3.2),
  ('IMPRENTA', 'CATEGORIA F', 'TRO', 2, 3.2),
  ('LAVADERO DE AUTOS', 'CATEGORIA F', 'TRO', 2, 3.2),
  ('PIZZERIA', 'CATEGORIA F', 'TRO', 2, 3.2),
  ('SANTUARIO', 'CATEGORIA F', 'TRO', 2, 3.2),
  ('LOMITERIA', 'CATEGORIA G', 'TRO', 2.3, 3.68),
  ('MINIMERCADO', 'CATEGORIA G', 'TRO', 2.3, 3.68),
  ('TALLER DE MAQUINAS', 'CATEGORIA G', 'TRO', 2.3, 3.68),
  ('TALLER MECANICO', 'CATEGORIA G', 'TRO', 2.3, 3.68),
  ('CANCHA SINTETICA', 'CATEGORIA G', 'TRO', 2.3, 3.68),
  ('CASA DE EQUIPAMIENTOS', 'CATEGORIA G', 'TRO', 2.3, 3.68),
  ('CENTRO LUBRICACION', 'CATEGORIA G', 'TRO', 2.3, 3.68),
  ('CONFECCION DE PRENDAS DE VESTIR', 'CATEGORIA H', 'TRO', 2.5, 4),
  ('DEPOSITO', 'CATEGORIA H', 'TRO', 2.5, 4),
  ('ESTACION DE SERVICIO Y SHOP', 'CATEGORIA H', 'TRO', 2.5, 4),
  ('FERRETERIA', 'CATEGORIA H', 'TRO', 2.5, 4),
  ('HOTEL Y RESTAURANT', 'CATEGORIA H', 'TRO', 2.5, 4),
  ('SUPERMERCADO', 'CATEGORIA H', 'TRO', 2.5, 4),
  ('TINGLADOS', 'CATEGORIA H', 'TRO', 2.5, 4),
  ('PANADERIAS', 'CATEGORIA H', 'TRO', 2.5, 4),
  ('DEPOSITOS', 'CATEGORIA H', 'TRO', 2.5, 4),
  ('CHANCHERIAS', 'CATEGORIA I', NULL, 3.5, 5.6),
  ('GRANJA EN GENERAL', 'CATEGORIA I', NULL, 3.5, 5.6);

-- ============ CATÁLOGO DE COBERTURAS MRC ============
-- Tasas (columna "Tasa MRC" de la pestaña DATOS) confirmadas contra la pestaña MRC del mismo
-- Excel (ejemplo de cálculo real, rubro BAZAR). Textos legales copiados de la config real del
-- sistema de escritorio (planes "Multirriesgo Comercio - Normal" y "Comercio Protección
-- Total", 2026-07-10). Franquicias: 10% s/siniestro con mínimo variable por cobertura, salvo
-- Incendio de edificio que no tiene deducible. Excepción regional NO modelada acá (Itapúa/Alto
-- Paraná aplican 10% mín. Gs. 500.000 a la cobertura de Caída de Rayo, que en el resto del país
-- va sin deducible dentro de Incendio) — es una variable de la cotización, no del catálogo.

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, franquicia_default, es_opcional)
SELECT id, 'incendio_edificio', 'Incendio de Edificio', 'Coberturas Principales',
  'Incendio, Rayo y Explosión; Incendio y daños materiales por Huracán, Vendaval, Ciclón o Tornado; Incendio y daños materiales por Tumulto y/o Alboroto Popular y/o Huelga (siempre que no sea por motivos políticos); Daños materiales por Caída de Aeronaves y/o sus partes componentes; Daños materiales por Impacto de vehículos terrestres de terceros; Daños materiales por Humo y Hollín. Aplica sobre el edificio.',
  'Variación de Tensión y Arcos Voltaicos. Si el edificio no tiene los 4 costados cerrados, se excluye Huracán/Vendaval/Ciclón/Tornado.',
  NULL, FALSE
FROM ramos WHERE nombre = 'mrc';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, franquicia_default, es_opcional)
SELECT id, 'incendio_contenido', 'Incendio de Contenido', 'Coberturas Principales',
  'Mismos riesgos cubiertos que Incendio de Edificio (ver esa cobertura), aplicados sobre el contenido general/mercaderías.',
  'Ídem Incendio de Edificio. Joyas, metales preciosos, títulos y papeles, obras de arte, entre otros, quedan excluidos salvo que se contraten aparte.',
  500000, FALSE
FROM ramos WHERE nombre = 'mrc';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, franquicia_default, es_opcional)
SELECT id, 'incendio_mobiliario_equipos', 'Incendio de Mobiliario y Equipos', 'Coberturas Principales',
  'Mismos riesgos cubiertos que Incendio de Edificio (ver esa cobertura), aplicados sobre muebles, equipos y enseres — variante usada en "Comercio Protección Total".',
  'Ídem Incendio de Edificio.',
  800000, TRUE
FROM ramos WHERE nombre = 'mrc';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, franquicia_default, es_opcional)
SELECT id, 'robo_contenido', 'Robo y/o Asalto del Contenido', 'Coberturas Principales',
  'A primer riesgo absoluto, sobre el contenido general/mercaderías del local.',
  'Bienes fuera del local (patios, corredores, terrazas al aire libre). Complicidad de empleados. Hurto simple con escalamiento o llave hallada. Sin rejas de protección, se excluye robo fuera del horario habitual de tareas.',
  500000, FALSE
FROM ramos WHERE nombre = 'mrc';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, franquicia_default, es_opcional)
SELECT id, 'robo_caja_registradora', 'Robo (Caja Registradora / Valores en Caja Fuerte)', 'Coberturas Principales',
  'A primer riesgo absoluto. Requiere caja fuerte tipo tesoro, frente/fondo de acero templado ≥3mm, ≥200kg o empotrada/amurada. Cubre el dinero circulante durante el horario habitual de tareas.',
  'Hurto o desaparición misteriosa. Complicidad de personal jerárquico o custodio. Pasado el horario habitual, el efectivo debe estar depositado en caja fuerte o queda sin cobertura.',
  500000, FALSE
FROM ramos WHERE nombre = 'mrc';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, franquicia_default, es_opcional)
SELECT id, 'robo_transito', 'Robo (Tránsito)', 'Coberturas Principales',
  'A primer riesgo absoluto, valores en tránsito fuera del local asegurado.',
  NULL, 500000, TRUE
FROM ramos WHERE nombre = 'mrc';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, franquicia_default, es_opcional)
SELECT id, 'cristales', 'Rotura de Cristales, Vidrios o Espejos', 'Coberturas Principales',
  NULL, NULL, 1200000, TRUE
FROM ramos WHERE nombre = 'mrc';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, franquicia_default, es_opcional)
SELECT id, 'responsabilidad_civil', 'Responsabilidad Civil', 'Coberturas Principales',
  NULL, NULL, 500000, FALSE
FROM ramos WHERE nombre = 'mrc';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, franquicia_default, es_opcional)
SELECT id, 'equipos_electronicos', 'Equipos Electrónicos', 'Coberturas Principales',
  NULL, NULL, 300000, TRUE
FROM ramos WHERE nombre = 'mrc';

-- Sublímites: a primer riesgo absoluto, monto fijo por cada vigencia (no por siniestro salvo
-- donde se indique). El monto real varía por plan — ver plan_coberturas más abajo.

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, es_opcional)
SELECT id, 'sublimite_cctv', 'Circuito Cerrado de Televisión (Cámaras de Seguridad)', 'Sublímites',
  'A primer riesgo absoluto, sublímite dentro de la cobertura de Incendio. Tasa no confirmada en el Excel de tasas — pendiente.',
  TRUE
FROM ramos WHERE nombre = 'mrc';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, es_opcional)
SELECT id, 'sublimite_danos_agua', 'Daños por Agua', 'Sublímites',
  'A primer riesgo absoluto, sublímite dentro de la cobertura de Incendio.',
  TRUE
FROM ramos WHERE nombre = 'mrc';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, es_opcional)
SELECT id, 'sublimite_equipos_electronicos', 'Daños a Equipos Electrónicos (sublímite Incendio)', 'Sublímites',
  'A primer riesgo absoluto, sublímite dentro de la cobertura de Incendio — distinto de la cobertura propia "Equipos Electrónicos". Solo visto en el plan "Multirriesgo Comercio - Normal".',
  TRUE
FROM ramos WHERE nombre = 'mrc';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, es_opcional)
SELECT id, 'sublimite_murallas_cercos', 'Daños a Murallas, Cercos Perimetrales y Rejas', 'Sublímites',
  'A primer riesgo absoluto, por daños o pérdidas consecuencia de un riesgo cubierto. Monto máximo por cada vigencia.',
  TRUE
FROM ramos WHERE nombre = 'mrc';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, es_opcional)
SELECT id, 'sublimite_granizo', 'Daños por Granizo (al edificio)', 'Sublímites',
  'A primer riesgo absoluto, por daños al edificio. Monto máximo por cada vigencia.',
  TRUE
FROM ramos WHERE nombre = 'mrc';

-- ============ TASAS POR COBERTURA (‰, ramo MRC) ============
-- Fuente: pestaña DATOS de "Version 01 - Calculo Varios.xlsx", columna "Tasa MRC".
-- sublimite_cctv queda SIN tasa (no está en el Excel) — no se inserta fila hasta confirmar.

INSERT INTO tasas_cobertura_ramo (ramo_id, cobertura_id, tasa_valor, unidad)
SELECT r.id, c.id, v.tasa, 'permil'
FROM ramos r
JOIN coberturas_catalogo c ON c.ramo_id = r.id
CROSS JOIN (VALUES
  ('incendio_edificio', 1.0),
  ('incendio_contenido', 2.0),
  ('incendio_mobiliario_equipos', 0.65),
  ('robo_contenido', 8.0),
  ('robo_caja_registradora', 10.0),
  ('robo_transito', 10.0),
  ('cristales', 8.0),
  ('responsabilidad_civil', 10.0),
  ('equipos_electronicos', 15.0),
  ('sublimite_danos_agua', 22.0),
  ('sublimite_equipos_electronicos', 16.0),
  ('sublimite_murallas_cercos', 22.0),
  ('sublimite_granizo', 22.0)
) AS v(codigo, tasa)
WHERE r.nombre = 'mrc' AND c.codigo = v.codigo;

-- ============ PLANES MRC ============

-- "Multirriesgo Comercio - Normal": único con configuración completa de cotizador confirmada
-- contra el sistema de escritorio real (2026-07-10).
INSERT INTO planes (ramo_id, nombre, prima_tecnica_minima, cotizacion_combinada, descuento_maximo, recargo_maximo, cuotas_default, cuotas_maximo)
SELECT id, 'MULTIRRIESGO COMERCIO - NORMAL', 409091, FALSE, 30, 20, 11, 11
FROM ramos WHERE nombre = 'mrc';

-- "Comercio Protección Total": existe como set de coberturas (texto legal confirmado) pero NO
-- tiene configuración de cotizador en el sistema de escritorio — prima_tecnica_minima,
-- descuento_maximo, recargo_maximo y RPF quedan sin cargar hasta que Kevin confirme cómo se
-- cotiza este plan hoy (a mano, o con otro parámetro no visto todavía).
INSERT INTO planes (ramo_id, nombre, cotizacion_combinada)
SELECT id, 'COMERCIO PROTECCION TOTAL', FALSE
FROM ramos WHERE nombre = 'mrc';

-- RPF confirmado (pantalla real) solo para "Multirriesgo Comercio - Normal".
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
WHERE p.nombre = 'MULTIRRIESGO COMERCIO - NORMAL' AND fp.codigo = v.codigo;

-- ============ MONTOS DE SUBLÍMITE POR PLAN ============
-- El monto de cada sublímite varía por plan (confirmado por Kevin contra los dos textos
-- reales). Las coberturas principales NO se cargan acá: la suma asegurada de Incendio/Robo se
-- define por cotización (capital del cliente, distribuido 50/50 o 60/10/30 según el plan), no
-- es un monto fijo de catálogo.

INSERT INTO plan_coberturas (plan_id, cobertura_id, incluida_por_defecto, monto)
SELECT p.id, c.id, TRUE, v.monto
FROM planes p
JOIN coberturas_catalogo c ON c.ramo_id = p.ramo_id
CROSS JOIN (VALUES
  ('sublimite_cctv', 5000000),
  ('sublimite_danos_agua', 2500000),
  ('sublimite_equipos_electronicos', 5000000),
  ('sublimite_murallas_cercos', 1000000),
  ('sublimite_granizo', 5000000)
) AS v(codigo, monto)
WHERE p.nombre = 'MULTIRRIESGO COMERCIO - NORMAL' AND c.codigo = v.codigo;

INSERT INTO plan_coberturas (plan_id, cobertura_id, incluida_por_defecto, monto)
SELECT p.id, c.id, TRUE, v.monto
FROM planes p
JOIN coberturas_catalogo c ON c.ramo_id = p.ramo_id
CROSS JOIN (VALUES
  ('sublimite_cctv', 5000000),
  ('sublimite_danos_agua', 2000000),
  ('sublimite_murallas_cercos', 1000000),
  ('sublimite_granizo', 5000000)
) AS v(codigo, monto)
WHERE p.nombre = 'COMERCIO PROTECCION TOTAL' AND c.codigo = v.codigo;