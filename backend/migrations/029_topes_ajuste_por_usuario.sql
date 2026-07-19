-- 029_topes_ajuste_por_usuario.sql
-- Fase 5: tope propio de descuento/recargo por usuario, editable desde "Editar usuario"
-- en el panel admin. NULL = el usuario no tiene tope propio, se respeta tal cual el tope
-- del plan (planes.descuento_maximo/recargo_maximo). Si ambos están cargados, gana el más
-- restrictivo (MIN) — ver mrc.calculator.js / incendio.calculator.js.

ALTER TABLE usuarios
  ADD COLUMN descuento_maximo_pct NUMERIC(5,2),
  ADD COLUMN recargo_maximo_pct NUMERIC(5,2);
