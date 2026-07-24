-- Índices en foreign keys de alto tráfico + fix de search_path en función RPC.
-- Ver docs/ESTADO_PROYECTO.md sección 7 (auditoría de schema, 2026-07-23).

-- cotizaciones: el listado de Historial (findCotizaciones en
-- backend/src/repositories/cotizaciones.repository.js) siempre filtra por agente_id cuando el
-- usuario no es admin (cotizacion.service.js) y siempre ordena por created_at DESC. Índice
-- compuesto para cubrir filtro + orden sin sort adicional.
CREATE INDEX idx_cotizaciones_agente_id_created_at
  ON cotizaciones(agente_id, created_at DESC);

-- ramo_id y estado se combinan de forma opcional e independiente (admin sin agente_id, o agente
-- + estado) - se dejan sueltos para que Postgres los combine vía bitmap AND según el filtro real.
CREATE INDEX idx_cotizaciones_ramo_id ON cotizaciones(ramo_id);
CREATE INDEX idx_cotizaciones_estado ON cotizaciones(estado);

CREATE INDEX idx_cotizacion_coberturas_cotizacion_id
  ON cotizacion_coberturas(cotizacion_id);

CREATE INDEX idx_cotizacion_variantes_cotizacion_id
  ON cotizacion_variantes(cotizacion_id);

-- Lint de seguridad de Supabase: función sin search_path fijo es vulnerable a hijacking de
-- search_path por el rol que la ejecuta.
ALTER FUNCTION siguiente_correlativo(int) SET search_path = public;
