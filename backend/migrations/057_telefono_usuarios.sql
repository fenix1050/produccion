-- Ítem #8 del Ajuste MC.xlsx (Análisis de Riesgo, 2026-08-05): el bloque de firma de la Carta
-- Oferta de MRC necesita un teléfono de contacto del agente que emitió la cotización, dato que
-- no existía en `usuarios` (solo nombre/email). Nullable — no todos los roles emiten cartas
-- oferta y no hay backfill posible para usuarios existentes.
ALTER TABLE usuarios ADD COLUMN telefono VARCHAR(30);
