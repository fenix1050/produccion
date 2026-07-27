-- 037_tipos_cambio.sql
-- Cuarta migración del cambio "incendio-3-planes-y-moneda". Historial de tipo de cambio,
-- poblado automáticamente desde la API pública de dolarPy (`GET
-- https://dolar.melizeche.com/api/1.0/`, campos `dolarpy.set.compra`/`dolarpy.set.venta`,
-- cotización de la Casa de Cambio SET — confirmada por Kevin como la referencia de la empresa,
-- ver proposal.md "Decisiones confirmadas por Kevin"). Append-only a propósito: nunca se hace
-- UPDATE de una fila existente, solo INSERT de un nuevo valor observado — "vigente" es siempre
-- la fila más reciente por moneda (`ORDER BY obtenido_en DESC LIMIT 1`, ver
-- tipos-cambio.repository.js). Esto preserva la trazabilidad exacta de qué tipo de cambio
-- estaba vigente en cada momento, necesaria porque cada cotización snapshotea el valor usado
-- (no se recalcula retroactivamente).
--
-- `origen = 'manual'` es el salvavidas de panel admin mencionado en design.md por si dolarPy
-- queda caído por un período prolongado (sin SLA, servicio de terceros no oficial) — la fila
-- se puede insertar a mano vía `registrarTipoCambioManual()` sin necesitar UI en este cambio.

CREATE TABLE tipos_cambio (
  id BIGSERIAL PRIMARY KEY,
  moneda CHAR(3) NOT NULL DEFAULT 'USD',
  fuente TEXT NOT NULL DEFAULT 'dolarpy:set',
  compra NUMERIC(12, 4),
  venta NUMERIC(12, 4) NOT NULL,
  origen TEXT NOT NULL DEFAULT 'api' CHECK (origen IN ('api', 'manual')),
  obtenido_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_tipos_cambio_vigente ON tipos_cambio (moneda, obtenido_en DESC);
