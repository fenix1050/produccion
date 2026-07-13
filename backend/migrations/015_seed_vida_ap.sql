-- 015_seed_vida_ap.sql
-- Catálogo de coberturas, planes y tasas de Vida y Accidentes Personales — tercer y último ramo
-- del orden interno de Fase 6/7 (MRC → Incendio → Vida/AP).
--
-- Fuentes (orden de confiabilidad):
--  - `M-08OP-GT-01, Manual de Suscripción Vida y Accidentes Personales v.02 301024.pdf`: a
--    diferencia del manual de Incendio/Hogar/Comercio/TRO, ESTE SÍ tiene texto extraíble (no es
--    escaneado). Es la fuente PRINCIPAL: define los 5 sub-productos del ramo (Protección de
--    Préstamos, Protección Familiar, Accidentes Personales, Vida Directivos y Empleados, Aportes
--    y Ahorros), sus coberturas/exclusiones, y el "Anexo 2 – Tasa" con las tasas que el manual
--    llama textualmente "tasas obligatorias para el presente período" — se usan tal cual, sin
--    cruzarlas contra otra fuente, porque el manual ya es la fuente de mayor autoridad (es la
--    misma jerarquía de fuentes ya aplicada en MRC/Incendio: manual/sistema real > Excel técnico).
--  - Dos cotizaciones reales de AP ya emitidas por Tajy (`docs/insumos/`): "2026_06_24 ALKA
--    CONSTRUCCIONES S.A - AP, RC,TRC.pdf" (sección AP) y "2026_07_08 Floriano Kochhan Hoffmann -
--    AP.pdf". Confirman el texto real de coberturas/exclusiones de Accidentes Personales
--    (Muerte a consecuencia de accidente, Incapacidad total y permanente a consecuencia de
--    accidente, Gastos Médicos por accidente, y en el caso de Floriano además Gastos de Sepelio)
--    tal como se redactan en la cotización real al cliente — mismo criterio ya usado en
--    MRC/Incendio de preferir el texto real sobre el texto del manual cuando ambos existen.
--  - "Tajy Cotizador Vida Colectivo 2025-04-04.xlsx" y "Tajy Cotizador AP 2025-12-18.xlsx": son
--    herramientas del dpto. técnico con un motor de cálculo MÁS GRANULAR que el manual — tabla de
--    mortalidad "SISPY 2017" edad por edad (18 a 75+) para Vida Colectivo, y tasas ‰ por
--    cobertura (Fallecimiento 0,7‰, Invalidez 0,35‰, Gastos Médicos 6‰, Sepelio 0,7‰) más una
--    escala de Renta Diaria por cantidad de días (15 a 360) para AP — con una capa adicional de
--    recargos de compañía (Utilidad/Gastos Adm./Comisión/Cobranza/IVA) para llegar de "Prima
--    Pura" a "Premio". NO SE USAN para cargar el catálogo/tasas de esta migración: el manual ya
--    da una tasa oficial más simple y explícitamente vigente ("tasas obligatorias"), y esa tasa
--    ‰ granular por cobertura no coincide numéricamente con la tasa combinada del manual (ej. AP
--    cooperativo 5,5‰ del manual vs. la suma de las 4 tasas del Excel, que da un número distinto)
--    — no se intenta reconciliar ambas fuentes ni adivinar cuál "está mal", igual que ya se dejó
--    documentado sin resolver el caso de RPF de Incendio. Quedan como referencia para cuando se
--    escriba `vida-ap.js` (el motor de cálculo grupal con mortalidad SISPY 2017 puede ser el que
--    de verdad use el dpto. técnico para pólizas colectivas grandes, distinto del cálculo rápido
--    por tasa fija del manual — a confirmar con Kevin cuál aplica en cada caso, no se decide acá).
--
-- Decisión de modelado: NO se usa `tasas_cobertura_ramo` (tasa fija por cobertura, compartida
-- por todo el ramo) porque en Vida/AP la MISMA cobertura tiene tasas distintas según el plan
-- (ej. "Muerte por Cualquier Causa" cobra 10‰ en Protección Familiar pero tasa por franja etaria
-- en Vida Directivos) — a diferencia de MRC/Incendio, donde una cobertura tenía una sola tasa
-- para todo el ramo. Se usa `tarifas_generico` (ramo_id + plan_id + variables JSONB), la tabla
-- genérica ya prevista en el schema (004_tarifacion.sql) para tarifación que no encaja en el
-- modelo de tasa fija ni en el de tasa por capital — cada fila documenta a qué cobertura aplica
-- vía la clave "cobertura_codigo" dentro del JSONB.

-- ============ CATÁLOGO DE COBERTURAS ============

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, es_opcional)
SELECT id, 'fallecimiento_cualquier_causa', 'Muerte por Cualquier Causa', 'Coberturas Básicas',
  'Indemnización del capital asegurado a los beneficiarios designados o herederos legales en caso de fallecimiento del asegurado por cualquier causa. Usada por Protección de Préstamos, Protección Familiar, Vida Directivos y Empleados, y Aportes y Ahorros (manual de suscripción, cada sección).',
  'Enfermedades preexistentes y conocidas en la época de contratación del seguro y no declaradas. Suicidio o tentativa de suicidio, salvo 3 años de renovaciones sucesivas ininterrumpidas. Uso de material nuclear, actos de guerra/guerrilla/revolución. Envenenamiento por absorción de sustancias tóxicas, salvo escape de gases y vapores. Alteraciones mentales por alcohol/drogas. Actos ilícitos del asegurado. Aviación no regular. Participación en duelo.',
  FALSE
FROM ramos WHERE nombre = 'vida-ap';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, es_opcional)
SELECT id, 'invalidez_prestamos', 'Invalidez Total y Permanente por Accidente y/o Enfermedad', 'Coberturas Básicas',
  'Exclusiva de Protección de Préstamos: ampara al tomador ante la invalidez total y permanente de sus deudores. El pago del beneficio de incapacidad total y permanente de un socio procede únicamente si, antes de cumplir 65 años de edad, queda total y permanentemente incapacitado; el pago tiene el efecto de terminar la cobertura bajo esa póliza y el socio deja de ser elegible para nuevas pólizas de protección de préstamos de la compañía.',
  'Ídem exclusiones de Muerte por Cualquier Causa. Requiere declaración de salud al momento del otorgamiento del préstamo; en préstamos por sumas elevadas requiere además examen médico.',
  FALSE
FROM ramos WHERE nombre = 'vida-ap';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, es_opcional)
SELECT id, 'muerte_accidental_doble_indemnizacion', 'Muerte Accidental (Doble Indemnización)', 'Coberturas Adicionales',
  'Si el asegurado fallece antes de cierta edad límite (69 años en Aportes y Ahorros) como resultado directo de lesión corporal accidental evidenciada por lesión/herida en la parte exterior del cuerpo, la compañía paga adicionalmente a la cobertura usual de Muerte por Cualquier Causa la cantidad señalada como capital asegurado para ese socio. Usada por Vida Directivos y Empleados, y Aportes y Ahorros.',
  'Ahogamiento sin lesión externa visible, o lesiones internas reveladas solo por autopsia, quedan fuera de la definición de accidente para este adicional salvo prueba en contrario.',
  TRUE
FROM ramos WHERE nombre = 'vida-ap';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, es_opcional)
SELECT id, 'perdidas_organicas', 'Pérdidas Orgánicas / Desmembramiento por Accidente', 'Coberturas Adicionales',
  'Si el socio asegurado no fallece a consecuencia del accidente pero sufre una pérdida orgánica cubierta (ambas manos/pies/vista de ambos ojos, una mano y un pie, una mano y la vista de un ojo, un pie y la vista de un ojo: hasta la suma máxima estipulada en póliza; vista de un ojo o una mano o un pie: hasta el 50% de la suma asegurada), la compañía indemniza según esa escala. El costo de esta cobertura está incluido en la tasa básica del plan, sin cargo adicional. Usada por Vida Directivos y Empleados, y Aportes y Ahorros (como "Desmembramiento").',
  'Ídem exclusiones de Muerte por Cualquier Causa.',
  TRUE
FROM ramos WHERE nombre = 'vida-ap';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, es_opcional)
SELECT id, 'reembolso_gastos_funerarios', 'Reembolso de Gastos Funerarios', 'Coberturas Básicas',
  'Exclusiva de Protección Familiar: reembolso de gastos funerarios por fallecimiento de algún miembro de la familia cubierta en el plan (pareja, hijos dependientes y padres de la pareja hasta 69 años). Suele contratarse como seguro de vida colectivo por medio de un tomador, aunque puede contratarse en forma individual.',
  'Ídem exclusiones de Muerte por Cualquier Causa.',
  FALSE
FROM ramos WHERE nombre = 'vida-ap';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, es_opcional)
SELECT id, 'muerte_accidente_ap', 'Muerte a Consecuencia de Accidente', 'Coberturas Básicas',
  'Muerte a consecuencia de accidente. Se entiende por accidente todo hecho que cause una lesión corporal, determinable por médicos de manera cierta, sufrida por el asegurado independientemente de su voluntad, por la acción repentina y violenta de un agente externo. Ámbito: dentro y fuera del Paraguay, durante actividades laborales y particulares (texto confirmado contra 2 cotizaciones reales de AP: ALKA Construcciones 2026-06-24, Floriano Kochhan Hoffmann 2026-07-08).',
  'Suicidio. Fabricación de municiones/explosivos/fuegos artificiales, personal militar/policial. Mineros y trabajadores de pozos petroleros. Personal de vuelo de aviación. Deportistas profesionales y expediciones científicas. Seguro de desempleo. Terrorismo (excluido en todo el ramo de Accidentes Personales). Extracción/construcción bajo tierra o agua. Exploración de gas/petróleo. Industrias químicas. Equipos de deportes. Personal de líneas aéreas/marítimas. Enfermedades de cualquier naturaleza (incluida picadura de insectos), lesiones por rayos X/radio/reacciones nucleares, insolación/quemaduras solares/enfriamiento, psicopatías, operaciones quirúrgicas.',
  FALSE
FROM ramos WHERE nombre = 'vida-ap';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, es_opcional)
SELECT id, 'invalidez_accidente_ap', 'Incapacidad Total y Permanente a Consecuencia de Accidente', 'Coberturas Básicas',
  'Incapacidad total y permanente a consecuencia de accidente. Divide la invalidez en total y parcial: total ante alineación mental absoluta e incurable, o fractura incurable de columna que impida cualquier trabajo remunerado; parcial según escala por parte del cuerpo afectada (cabeza, miembros superiores/inferiores, con mayor % para el lado diestro salvo asegurado zurdo declarado). Invalidez parcial que llegue al 80% se considera invalidez total. Texto confirmado contra 2 cotizaciones reales de AP.',
  'Ídem exclusiones de Muerte a Consecuencia de Accidente. Personas no asegurables salvo pacto en contrario: menores de 14 años o mayores de 65, ciegos, miopes (>10 dioptrías), mutilados, inválidos >10%, paralíticos, epilépticos, toxicómanos o alienados.',
  FALSE
FROM ramos WHERE nombre = 'vida-ap';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, es_opcional)
SELECT id, 'gastos_medicos_accidente', 'Gastos Médicos por Accidente', 'Coberturas Básicas',
  'La compañía amplía la cobertura para cubrir gastos de honorarios médicos, internación, productos farmacéuticos, radiografías, tratamientos especiales, etc., a consecuencia de accidente. Texto confirmado contra 2 cotizaciones reales de AP. La suma asegurada por asistencia médica no puede exceder la fijada para Muerte o Invalidez Permanente (manual, Anexo 2).',
  'Ídem exclusiones de Muerte a Consecuencia de Accidente.',
  TRUE
FROM ramos WHERE nombre = 'vida-ap';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, es_opcional)
SELECT id, 'gastos_sepelio_accidente', 'Gastos de Sepelio (Accidentes Personales)', 'Coberturas Adicionales',
  'Cobertura adicional de Accidentes Personales, vista en la cotización real de Floriano Kochhan Hoffmann (2026-07-08) con suma asegurada propia, separada de Muerte y de Gastos Médicos.',
  'Ídem exclusiones de Muerte a Consecuencia de Accidente.',
  TRUE
FROM ramos WHERE nombre = 'vida-ap';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, es_opcional)
SELECT id, 'renta_diaria_accidente', 'Renta Diaria por Accidente', 'Coberturas Adicionales',
  'Cobertura adicional de Accidentes Personales. La suma asegurada de renta diaria debe representar como máximo el 1‰ (uno por mil) de la suma asegurada por muerte (manual, Anexo 2). Inaplicable para asegurados menores de 16 años, y a partir de los 70 años tampoco aplica la de asistencia médica.',
  'Ídem exclusiones de Muerte a Consecuencia de Accidente.',
  TRUE
FROM ramos WHERE nombre = 'vida-ap';

INSERT INTO coberturas_catalogo (ramo_id, codigo, nombre, categoria, texto_legal, texto_exclusiones, es_opcional)
SELECT id, 'robo_tarjeta', 'Robo de Tarjeta (Protección de Préstamos)', 'Coberturas Adicionales',
  'Add-on de Protección de Préstamos para Cooperativas, ligado a tarjetas Vida Tarjeta Credicard, Visa, Visa Oro y Cabal (mismas tasas que Protección de Préstamos). Cantidad máxima 5 personas — individual Gs. 50.000.000, conjunto Gs. 250.000.000. Costo por plástico Gs. 167 (manual, Anexo 2).',
  NULL,
  TRUE
FROM ramos WHERE nombre = 'vida-ap';

-- ============ PLANES ============
-- 7 planes para los 5 sub-productos del manual: Protección de Préstamos y Accidentes Personales
-- se dividen cada uno en 2 variantes (Cooperativas/Mercado General y Cooperativo/Privado
-- respectivamente) porque el manual les da tasas y topes distintos — mismo criterio de "una fila
-- de planes por cada configuración de cotizador confirmada" ya usado en MRC (Normal vs. Comercio
-- Protección Total). Ninguno tiene prima_tecnica_minima/descuento_maximo/recargo_maximo/RPF
-- confirmado todavía — se tarifica 100% por `tarifas_generico`, y el RPF de Vida/AP sigue
-- pendiente de confirmación del dpto. técnico (mismo pendiente ya anotado para Incendio en la
-- migración 013 y en ESTADO_PROYECTO.md).

INSERT INTO planes (ramo_id, nombre, cotizacion_combinada)
SELECT id, 'PROTECCION DE PRESTAMOS - COOPERATIVAS', FALSE FROM ramos WHERE nombre = 'vida-ap';

INSERT INTO planes (ramo_id, nombre, cotizacion_combinada)
SELECT id, 'PROTECCION DE PRESTAMOS - MERCADO GENERAL', FALSE FROM ramos WHERE nombre = 'vida-ap';

INSERT INTO planes (ramo_id, nombre, cotizacion_combinada)
SELECT id, 'PROTECCION FAMILIAR', FALSE FROM ramos WHERE nombre = 'vida-ap';

INSERT INTO planes (ramo_id, nombre, cotizacion_combinada)
SELECT id, 'ACCIDENTES PERSONALES - SECTOR COOPERATIVO', FALSE FROM ramos WHERE nombre = 'vida-ap';

INSERT INTO planes (ramo_id, nombre, cotizacion_combinada)
SELECT id, 'ACCIDENTES PERSONALES - SECTOR PRIVADO', FALSE FROM ramos WHERE nombre = 'vida-ap';

INSERT INTO planes (ramo_id, nombre, cotizacion_combinada)
SELECT id, 'VIDA DIRECTIVOS Y EMPLEADOS', FALSE FROM ramos WHERE nombre = 'vida-ap';

INSERT INTO planes (ramo_id, nombre, cotizacion_combinada)
SELECT id, 'APORTES Y AHORROS', FALSE FROM ramos WHERE nombre = 'vida-ap';

-- ============ TASAS (tarifas_generico) ============
-- Fuente única: manual v.02, Anexo 2 – Tasa ("tasas obligatorias para el presente período").

-- Protección de Préstamos - Cooperativas: tasa mensual ‰ por franja etaria, tope Gs.800.000.000.
-- Recargo +50% sobre la tasa normal para edad superior a 80 años (no modelado como franja
-- adicional porque el manual no da una tasa numérica fija para ese tramo, solo el recargo
-- porcentual sobre la tasa que corresponda).
INSERT INTO tarifas_generico (ramo_id, plan_id, variables)
SELECT r.id, p.id, v.vars::jsonb
FROM ramos r JOIN planes p ON p.ramo_id = r.id AND p.nombre = 'PROTECCION DE PRESTAMOS - COOPERATIVAS'
CROSS JOIN (VALUES
  ('{"cobertura_codigo":"fallecimiento_cualquier_causa","edad_min":1,"edad_max":69,"tasa":0.3498,"unidad":"permil_mensual","limite_suma_asegurada":800000000}'),
  ('{"cobertura_codigo":"fallecimiento_cualquier_causa","edad_min":70,"edad_max":75,"tasa":0.7380,"unidad":"permil_mensual","limite_suma_asegurada":800000000}'),
  ('{"cobertura_codigo":"fallecimiento_cualquier_causa","edad_min":76,"edad_max":80,"tasa":2.120,"unidad":"permil_mensual","limite_suma_asegurada":800000000}'),
  ('{"cobertura_codigo":"fallecimiento_cualquier_causa","edad_min":81,"edad_max":null,"recargo_sobre_tasa_normal_pct":50,"nota":"Recargo en casos de edad superior a 80 años, aplicado a la tasa normal de la franja anterior — el manual no da tasa numérica fija para este tramo"}'),
  ('{"cobertura_codigo":"invalidez_prestamos","edad_min":1,"edad_max":69,"tasa":0.3498,"unidad":"permil_mensual","nota":"Prot. de Préstamos Refinanciado — misma tasa que la franja 1-69 de fallecimiento"}'),
  ('{"cobertura_codigo":"robo_tarjeta","tipo":"monto_fijo","aplica_a":["vida_tarjeta_credicard","visa","visa_oro","cabal"],"cantidad_maxima_personas":5,"monto_individual":50000000,"monto_conjunto":250000000,"costo_por_plastico":167,"nota":"Vida Tarjeta Credicard/Visa/Visa Oro/Cabal usan las mismas tasas de fallecimiento de esta tabla"}')
) AS v(vars);

-- Protección de Préstamos - Mercado General: tasa mensual ‰ por franja etaria, con tope de monto
-- y plazo máximo propios por franja (a diferencia de Cooperativas, que solo tiene un tope único).
INSERT INTO tarifas_generico (ramo_id, plan_id, variables)
SELECT r.id, p.id, v.vars::jsonb
FROM ramos r JOIN planes p ON p.ramo_id = r.id AND p.nombre = 'PROTECCION DE PRESTAMOS - MERCADO GENERAL'
CROSS JOIN (VALUES
  ('{"cobertura_codigo":"fallecimiento_cualquier_causa","edad_min":1,"edad_max":69,"tasa":0.35,"unidad":"permil_mensual","monto_maximo":600000000,"plazo":"sin_limite"}'),
  ('{"cobertura_codigo":"fallecimiento_cualquier_causa","edad_min":70,"edad_max":75,"tasa":0.74,"unidad":"permil_mensual","monto_maximo":30000000,"plazo_meses":24}'),
  ('{"cobertura_codigo":"fallecimiento_cualquier_causa","edad_min":76,"edad_max":80,"tasa":2.12,"unidad":"permil_mensual","monto_maximo":10000000,"plazo_meses":12}')
) AS v(vars);

-- Protección Familiar: tasa fija única (sector cooperativo y general comparten la misma tasa,
-- por eso es un solo plan a diferencia de Préstamos y AP).
INSERT INTO tarifas_generico (ramo_id, plan_id, variables)
SELECT r.id, p.id,
  '{"cobertura_codigo":"fallecimiento_cualquier_causa","tasa":10.0,"unidad":"permil","nota":"Tasa única para sector cooperativo y mercado general (manual, Anexo 2)"}'::jsonb
FROM ramos r JOIN planes p ON p.ramo_id = r.id AND p.nombre = 'PROTECCION FAMILIAR';

-- Accidentes Personales: tasa fija por sector sobre las coberturas básicas + recargo por renta
-- diaria (25% cooperativo / 30% privado) + recargo por edad superior a 69 años, hasta 80 años
-- ("+5", el manual no aclara si es +5 puntos porcentuales o +5% por año — se documenta el
-- número tal cual aparece en el Anexo 2 sin interpretar, mismo criterio que datos ambiguos ya
-- dejados sin resolver en Incendio/MRC).
INSERT INTO tarifas_generico (ramo_id, plan_id, variables)
SELECT r.id, p.id, v.vars::jsonb
FROM ramos r JOIN planes p ON p.ramo_id = r.id AND p.nombre = 'ACCIDENTES PERSONALES - SECTOR COOPERATIVO'
CROSS JOIN (VALUES
  ('{"cobertura_codigo":"muerte_accidente_ap","tasa":5.5,"unidad":"permil","nota":"Aplica a coberturas básicas (muerte, invalidez, gastos médicos); la suma de renta diaria no puede superar el 1 permil de la suma asegurada por muerte, y la de gastos médicos no puede superar la fijada para muerte/invalidez"}'),
  ('{"cobertura_codigo":"renta_diaria_accidente","recargo_pct":25,"nota":"Recargo sobre la tasa básica cuando se contrata Renta Diaria"}'),
  ('{"edad_min":70,"edad_max":80,"recargo":5,"nota":"Recargo en casos de edad superior a 69 años y hasta 80 años — el manual anota +5 sin especificar si es puntos porcentuales o % por año, no se interpreta"}')
) AS v(vars);

INSERT INTO tarifas_generico (ramo_id, plan_id, variables)
SELECT r.id, p.id, v.vars::jsonb
FROM ramos r JOIN planes p ON p.ramo_id = r.id AND p.nombre = 'ACCIDENTES PERSONALES - SECTOR PRIVADO'
CROSS JOIN (VALUES
  ('{"cobertura_codigo":"muerte_accidente_ap","tasa":6.9,"unidad":"permil","nota":"Aplica a coberturas básicas (muerte, invalidez, gastos médicos); la suma de renta diaria no puede superar el 1 permil de la suma asegurada por muerte, y la de gastos médicos no puede superar la fijada para muerte/invalidez"}'),
  ('{"cobertura_codigo":"renta_diaria_accidente","recargo_pct":30,"nota":"Recargo sobre la tasa básica cuando se contrata Renta Diaria"}'),
  ('{"edad_min":70,"edad_max":80,"recargo":5,"nota":"Recargo en casos de edad superior a 69 años y hasta 80 años — el manual anota +5 sin especificar si es puntos porcentuales o % por año, no se interpreta"}')
) AS v(vars);

-- Vida Directivos y Empleados: tasa anual ‰ por franja etaria (10 franjas, 18 a 69 años, único
-- rango asegurable — menores de 18 y mayores de 69 no son asegurables según el manual).
INSERT INTO tarifas_generico (ramo_id, plan_id, variables)
SELECT r.id, p.id, v.vars::jsonb
FROM ramos r JOIN planes p ON p.ramo_id = r.id AND p.nombre = 'VIDA DIRECTIVOS Y EMPLEADOS'
CROSS JOIN (VALUES
  ('{"cobertura_codigo":"fallecimiento_cualquier_causa","edad_min":18,"edad_max":25,"tasa":1.1,"unidad":"permil_anual"}'),
  ('{"cobertura_codigo":"fallecimiento_cualquier_causa","edad_min":26,"edad_max":29,"tasa":2.2,"unidad":"permil_anual"}'),
  ('{"cobertura_codigo":"fallecimiento_cualquier_causa","edad_min":30,"edad_max":34,"tasa":2.7,"unidad":"permil_anual"}'),
  ('{"cobertura_codigo":"fallecimiento_cualquier_causa","edad_min":35,"edad_max":39,"tasa":4.4,"unidad":"permil_anual"}'),
  ('{"cobertura_codigo":"fallecimiento_cualquier_causa","edad_min":40,"edad_max":44,"tasa":5.3,"unidad":"permil_anual"}'),
  ('{"cobertura_codigo":"fallecimiento_cualquier_causa","edad_min":45,"edad_max":49,"tasa":7.3,"unidad":"permil_anual"}'),
  ('{"cobertura_codigo":"fallecimiento_cualquier_causa","edad_min":50,"edad_max":54,"tasa":10.0,"unidad":"permil_anual"}'),
  ('{"cobertura_codigo":"fallecimiento_cualquier_causa","edad_min":55,"edad_max":59,"tasa":12.1,"unidad":"permil_anual"}'),
  ('{"cobertura_codigo":"fallecimiento_cualquier_causa","edad_min":60,"edad_max":64,"tasa":22.3,"unidad":"permil_anual"}'),
  ('{"cobertura_codigo":"fallecimiento_cualquier_causa","edad_min":65,"edad_max":69,"tasa":50.0,"unidad":"permil_anual"}'),
  ('{"cobertura_codigo":"fallecimiento_cualquier_causa","tipo":"reduccion_capital_jubilados","edad_cumplida":50,"pct_capital":75,"nota":"Trabajador jubilado: capital asegurado se reduce a este % del capital vigente al momento de la jubilación, según edad cumplida a esa fecha"}'),
  ('{"cobertura_codigo":"fallecimiento_cualquier_causa","tipo":"reduccion_capital_jubilados","edad_cumplida":60,"pct_capital":50}'),
  ('{"cobertura_codigo":"fallecimiento_cualquier_causa","tipo":"reduccion_capital_jubilados","edad_cumplida":65,"pct_capital":25,"nota":"A partir de acá el capital del jubilado queda fijo en 25% aunque siga envejeciendo, mientras se siga pagando la prima correspondiente"}')
) AS v(vars);

-- Aportes y Ahorros: tasa fija mensual sobre saldo declarado + escala de reducción del capital
-- de Muerte Accidental (doble indemnización)/Desmembramiento por edad del socio.
INSERT INTO tarifas_generico (ramo_id, plan_id, variables)
SELECT r.id, p.id, v.vars::jsonb
FROM ramos r JOIN planes p ON p.ramo_id = r.id AND p.nombre = 'APORTES Y AHORROS'
CROSS JOIN (VALUES
  ('{"cobertura_codigo":"fallecimiento_cualquier_causa","edad_min":18,"edad_max":69,"tasa":0.60,"unidad":"permil_mensual","base":"saldo_aporte_mas_ahorro_declarado"}'),
  ('{"cobertura_codigo":"muerte_accidental_doble_indemnizacion","edad_max":54,"pct_capital":100,"nota":"Cobertura al 100% del capital hasta los 54 años inclusive"}'),
  ('{"cobertura_codigo":"muerte_accidental_doble_indemnizacion","edad_min":55,"edad_max":59,"pct_capital":75}'),
  ('{"cobertura_codigo":"muerte_accidental_doble_indemnizacion","edad_min":60,"edad_max":64,"pct_capital":50}'),
  ('{"cobertura_codigo":"muerte_accidental_doble_indemnizacion","edad_min":65,"edad_max":69,"pct_capital":25}'),
  ('{"cobertura_codigo":"muerte_accidental_doble_indemnizacion","edad_min":70,"edad_max":null,"pct_capital":0}')
) AS v(vars);

-- ============ RPF / PLAN DE PAGO ============
-- No se inserta ninguna fila en `plan_formas_pago` para ninguno de los 7 planes: ninguna fuente
-- (manual, Excels, ni las 2 cotizaciones reales de AP) desglosa Prima/RPF/IVA por forma de pago
-- para Vida/AP. La cotización real de Floriano Kochhan Hoffmann muestra "Contado: Gs. 1.500.000"
-- y "Financiado: Inicial y 11 cuotas de Gs. 138.000", pero sin desglosar cuánto de esa diferencia
-- es RPF vs. otro componente — no alcanza para derivar `tasa_rpf` sin adivinar. Mismo pendiente ya
-- registrado para MRC ("Comercio Protección Total") e Incendio ("Incendio - Edificio y
-- Contenido") en ESTADO_PROYECTO.md — sigue esperando confirmación del dpto. técnico.

-- ============ CLÁUSULAS ============
-- No se inserta nada: el manual no da texto legal completo de cláusulas separadas para Vida/AP
-- (las condiciones de exclusiones/coberturas ya quedaron en `texto_legal`/`texto_exclusiones` de
-- cada cobertura). `clausulas_catalogo.texto_legal` es NOT NULL, no se inventa contenido.
