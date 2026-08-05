-- 058_rpf_por_cuotas.sql
-- R.P.F. variable por cantidad de cuotas (MRC / Incendio / Vida y Accidentes Personales).
--
-- REVIERTE una decisión histórica: 002_ramos_planes.sql:38-39 documentó que "la tasa RPF es
-- FIJA por forma de pago y por plan (NO varía por cantidad de cuotas — corrección confirmada
-- contra la pantalla real del cotizador)", y 023_rpf_incendio_y_vida_ap.sql:2-7 reafirmó ese
-- mismo criterio para Incendio y Vida y Accidentes Personales, incluso citando que el manual
-- de suscripción M-08OP-GT-01 trae una tabla de R.P.F. por cuotas que Kevin en ese momento
-- confirmó NO usar. Análisis de Riesgo ahora pidió explícitamente lo contrario (Ajuste MC.xlsx,
-- Hoja4, ver Engram #387): una sola curva de R.P.F. por cantidad de cuotas, compartida
-- verbatim entre MRC/Incendio/Vida-AP. Esta migración crea la tabla y el flag de activación
-- por ramo, pero NO activa el flag todavía (ver más abajo) — el código que lee esta tabla
-- se implementa recién en PR2 (rpf-variable-mrc, Fase 2).
--
-- Orden de rollout (design.md, sección "Migration / Rollout"): la forma más segura es
-- desplegar el código primero y recién después flipear el flag, para que ningún preview en
-- vivo pueda pegar contra `usa_rpf_por_cuotas = TRUE` sin que exista todavía el código que
-- resuelve la curva (eso daría 422 inesperados en MRC/Incendio/Vida-AP en producción).
-- Por eso esta migración (PR1) deja el flag en FALSE para los 3 ramos — la tabla y la
-- columna quedan creadas y sembradas, pero inertes. El UPDATE que pone el flag en TRUE se
-- hace en una migración separada de PR2, junto con el código que la lee.

CREATE TABLE rpf_cuotas (
  id            SERIAL PRIMARY KEY,
  forma_pago_id INT NOT NULL REFERENCES formas_pago(id),
  cuotas        SMALLINT NOT NULL CHECK (cuotas >= 1),
  tasa_rpf      NUMERIC(6,4) NOT NULL CHECK (tasa_rpf >= 0),
  UNIQUE (forma_pago_id, cuotas)
);

ALTER TABLE public.rpf_cuotas ENABLE ROW LEVEL SECURITY;

-- Sin policies (mismo criterio que 046): el backend usa SUPABASE_SERVICE_KEY (service_role,
-- bypasea RLS siempre), y no hay ningún cliente Supabase en el frontend. El default-deny
-- resultante solo afecta a los roles anon/authenticated, que no la consultan.

ALTER TABLE ramos ADD COLUMN usa_rpf_por_cuotas BOOLEAN NOT NULL DEFAULT FALSE;

-- Seed: 33 filas (cuotas 1-11 x Cobrador / Aquí Pago (boca_cobranza) / Tarjeta de Crédito),
-- valores de 4 decimales tal cual Hoja4 de docs/insumos/Ajuste MC.xlsx. `cuotas = 0` NO se
-- almacena a propósito (Hoja4 fila 0 es todo ceros para las 3 columnas, y `contado` ya tiene
-- `tiene_rpf = FALSE`) — resuelve a 0 por regla en el código de PR2, no por fila en esta tabla.
-- Tarjeta de Crédito @ 1-2 cuotas = 0 es una regla de negocio real (no un hueco de dato) y se
-- guarda como fila literal en 0, para que "fila ausente" siga significando "fuera de rango".
INSERT INTO rpf_cuotas (forma_pago_id, cuotas, tasa_rpf)
SELECT fp.id, v.cuotas, v.tasa_rpf
FROM formas_pago fp
JOIN (VALUES
  ('cobrador',        1,  1.2000),
  ('cobrador',        2,  1.5500),
  ('cobrador',        3,  1.6889),
  ('cobrador',        4,  2.7444),
  ('cobrador',        5,  3.8000),
  ('cobrador',        6,  4.8556),
  ('cobrador',        7,  5.9111),
  ('cobrador',        8,  7.1778),
  ('cobrador',        9,  8.2333),
  ('cobrador',       10,  8.8667),
  ('cobrador',       11,  9.5000),
  ('boca_cobranza',   1,  1.0000),
  ('boca_cobranza',   2,  1.2400),
  ('boca_cobranza',   3,  1.3511),
  ('boca_cobranza',   4,  2.1956),
  ('boca_cobranza',   5,  3.0400),
  ('boca_cobranza',   6,  3.8844),
  ('boca_cobranza',   7,  4.7289),
  ('boca_cobranza',   8,  5.7422),
  ('boca_cobranza',   9,  6.5867),
  ('boca_cobranza',  10,  7.0933),
  ('boca_cobranza',  11,  7.6000),
  ('tarjeta_credito',  1,  0.0000),
  ('tarjeta_credito',  2,  0.0000),
  ('tarjeta_credito',  3,  0.8000),
  ('tarjeta_credito',  4,  1.3000),
  ('tarjeta_credito',  5,  1.8000),
  ('tarjeta_credito',  6,  2.3000),
  ('tarjeta_credito',  7,  2.8000),
  ('tarjeta_credito',  8,  3.4000),
  ('tarjeta_credito',  9,  3.9000),
  ('tarjeta_credito', 10,  4.2000),
  ('tarjeta_credito', 11,  4.5000)
) AS v(codigo, cuotas, tasa_rpf) ON v.codigo = fp.codigo;

-- NOTA: el flag `usa_rpf_por_cuotas` queda en FALSE (default de columna) para los 8 ramos,
-- incluidos mrc/incendio/vida-ap, a propósito en esta migración. Se activa en PR2 junto con
-- el código de resolución (resolverTasaRpf en cotizacion.service.js) para no exponer 422s
-- en vivo antes de que exista el código que resuelve la curva. No hacer UPDATE acá.
