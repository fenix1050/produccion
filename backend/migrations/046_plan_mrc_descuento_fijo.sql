-- Migración 046: permiso de rol para editar el descuento fijo de un plan + plan nuevo de MRC
-- con descuento comercial fijo del 10% (cambio SDD `mrc-plan-descuento-fijo`).
--
-- Contexto (ver design.md del cambio):
-- 1. Se agrega `roles.puede_editar_descuento_plan`, siguiendo el modelo de permisos de rol
--    establecido por la migración 031 (columna en `roles`, NO en `usuarios`). El rol `admin`
--    (es_sistema = TRUE, inmutable desde el panel — ver services/admin/roles.service.js
--    editarRol) recibe el permiso acá directamente por UPDATE, porque el panel rechaza con 409
--    cualquier intento de editar un rol de sistema.
-- 2. Se reutiliza `planes.descuento_default` (ya existente, cargada hoy solo para los planes de
--    Auto PREMIUM/SUPERIOR/FUERTE, todos con `cotizacion_combinada = TRUE`) para el nuevo plan
--    de MRC, con `cotizacion_combinada = FALSE`. La guarda `!plan.cotizacion_combinada` en
--    `cotizacion.service.js#resolverDescuentos` es la condición exactamente complementaria a la
--    rama de franquicia dual de Auto (`resolverTiposFranquicia`, que sí lee
--    `plan.descuento_default` pero solo cuando `cotizacion_combinada = TRUE`) — los dos
--    consumidores de esta columna quedan mutuamente excluyentes por construcción, sin necesidad
--    de una columna nueva.
-- 3. `descuento_maximo = 10` (no un techo mayor): el 10% es la política comercial completa del
--    plan, así que también es el techo aplicable a un usuario CON permiso que edite el valor.
--    Con 10 el clamp de `topeEfectivo` es un no-op exacto en la ruta forzada (ver Decisión 2 de
--    design.md: el 10% forzado neutraliza el tope del USUARIO, no el del PLAN).
--
-- NOTA DE PROCESO (no de schema): el nombre del plan de abajo es un PLACEHOLDER literal.
-- Esta migración se COMMITEA pero NO se aplica contra Supabase real hasta que Kevin confirme
-- el nombre exacto del plan (ver Dependencies #1 en proposal.md).

-- 1) Permiso de rol
ALTER TABLE roles ADD COLUMN puede_editar_descuento_plan BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE roles SET puede_editar_descuento_plan = TRUE WHERE nombre = 'admin';

-- 2) Plan nuevo de MRC — descuento fijo del 10%, solo Contado
INSERT INTO planes (
  ramo_id,
  nombre,
  prima_tecnica_minima,
  cotizacion_combinada,
  descuento_default,
  descuento_maximo,
  recargo_maximo,
  cuotas_default,
  cuotas_maximo
)
SELECT
  id,
  'MULTIRRISGO COMERCIO - CONTADO 10 (PLACEHOLDER - CONFIRMAR NOMBRE CON KEVIN)',
  409091,
  FALSE,
  10,
  10,
  20,
  0,
  0
FROM ramos WHERE nombre = 'mrc';

-- 3) Formas de pago del plan nuevo: solo Contado habilitado (Cobrador/Boca de Cobranza/Tarjeta
-- de Crédito deshabilitados) — mismo patrón CROSS JOIN (VALUES ...) de 012_seed_mrc.sql.
INSERT INTO plan_formas_pago (plan_id, forma_pago_id, tasa_rpf, habilitada)
SELECT p.id, fp.id, v.tasa, v.habilitada
FROM planes p
JOIN formas_pago fp ON TRUE
CROSS JOIN (VALUES
  ('contado', 0.0, TRUE),
  ('cobrador', 0.0, FALSE),
  ('boca_cobranza', 0.0, FALSE),
  ('tarjeta_credito', 0.0, FALSE)
) AS v(codigo, tasa, habilitada)
WHERE p.nombre = 'MULTIRRISGO COMERCIO - CONTADO 10 (PLACEHOLDER - CONFIRMAR NOMBRE CON KEVIN)'
  AND fp.codigo = v.codigo;

-- ============================================================================
-- ROLLBACK (comentado — no se ejecuta automáticamente)
-- ============================================================================
-- N1 (negocio): desactivar el plan sin tocar código ni schema.
--   UPDATE planes SET activo = FALSE
--   WHERE nombre = 'MULTIRRISGO COMERCIO - CONTADO 10 (PLACEHOLDER - CONFIRMAR NOMBRE CON KEVIN)';
--
-- N2 (código): revertir el commit de esta migración. La columna `roles.puede_editar_descuento_plan`
--   y `planes.descuento_default` del plan nuevo quedan inertes (ningún código las vuelve a leer
--   para MRC), sin dato huérfano.
--
-- N3 (schema): revertir también el schema. Si el plan ya tiene cotizaciones asociadas, el DELETE
--   de más abajo falla por FK — en ese caso, quedarse en el rollback N1.
--   DELETE FROM plan_formas_pago WHERE plan_id = (
--     SELECT id FROM planes
--     WHERE nombre = 'MULTIRRISGO COMERCIO - CONTADO 10 (PLACEHOLDER - CONFIRMAR NOMBRE CON KEVIN)'
--   );
--   DELETE FROM planes
--   WHERE nombre = 'MULTIRRISGO COMERCIO - CONTADO 10 (PLACEHOLDER - CONFIRMAR NOMBRE CON KEVIN)';
--   ALTER TABLE roles DROP COLUMN puede_editar_descuento_plan;
