-- 020_robo_valores_ventanilla.sql
-- Agrega "Robo valores ventanilla" al catálogo de MRC. Confirmado por Kevin (2026-07-13)
-- contra una Propuesta Formal real: usa la misma tasa que "Valores en caja fuerte" (10‰,
-- codigo robo_caja_registradora) — el Excel lo describe como "hasta el 30% del valor en Caja
-- Fuerte", pero el 30% es solo una sugerencia de referencia, no un cálculo forzado: el agente
-- declara su propia suma asegurada para esta línea igual que cualquier otra cobertura
-- adicional (ver mrc.calculator.js / coberturas_adicionales).
--
-- A diferencia de las demás coberturas/sublímites, esta línea NO debe sumar al "Suma
-- Asegurada total" que se muestra en Detalle del plan — Kevin confirmó que en la Propuesta
-- Formal real ese total se calcula sin incluirla (es un sub-límite de Caja Fuerte, no una suma
-- asegurada independiente). Se agrega una columna nueva en vez de reusar `categoria` porque
-- las otras 4 coberturas categoria='Sublímites' (murallas, granizo, agua, equipos electrónicos)
-- SÍ cuentan para el total — no es un comportamiento genérico de "Sublímites", es específico
-- de esta cobertura.

ALTER TABLE coberturas_catalogo
  ADD COLUMN incluye_en_suma_asegurada_total BOOLEAN NOT NULL DEFAULT TRUE;

INSERT INTO coberturas_catalogo (
  ramo_id, codigo, nombre, categoria, texto_legal, franquicia_default, es_opcional,
  incluye_en_suma_asegurada_total
)
SELECT id, 'robo_valores_ventanilla', 'Robo valores ventanilla', 'Sublímites',
  'A primer riesgo absoluto, sub-límite de "Valores en caja fuerte" — de referencia, hasta el 30% del valor asegurado en Caja Fuerte.',
  500000, TRUE, FALSE
FROM ramos WHERE nombre = 'mrc';

INSERT INTO tasas_cobertura_ramo (ramo_id, cobertura_id, tasa_valor, unidad)
SELECT r.id, c.id, 10, 'permil'
FROM ramos r
JOIN coberturas_catalogo c ON c.ramo_id = r.id AND c.codigo = 'robo_valores_ventanilla'
WHERE r.nombre = 'mrc';
