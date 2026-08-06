-- Ítem #6 del Ajuste MC.xlsx (Análisis de Riesgo, 2026-08-05): el botón "+ Agregar cobertura"
-- del cotizador MRC (selector libre de cualquier cobertura del catálogo + monto) se restringe
-- para agente/Comercial, que en su lugar ven una lista fija de checkboxes por cobertura (con
-- monto solo al tildar). admin/Análisis de Riesgo, o los roles que el admin defina, conservan
-- el flujo libre actual — permiso de rol nuevo, mismo patrón que roles.puede_editar_descuento_plan
-- (migración 048) / roles.puede_ver_descuento_plan (migración 050).
--
-- DEFAULT TRUE (comportamiento actual preservado para cualquier rol no listado abajo — incluidos
-- roles custom futuros) + UPDATE selectivo restringiendo los 2 roles que Kevin confirmó
-- explícitamente (agente, Comercial). 'agente' es es_sistema = true, así que el panel admin
-- bloquea editar sus permisos por UI — el UPDATE de abajo es la única forma de fijarlo (mismo
-- gotcha ya documentado para 'puede_ver_descuento_plan').
ALTER TABLE roles ADD COLUMN puede_agregar_cobertura_libre BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE roles SET puede_agregar_cobertura_libre = FALSE WHERE nombre IN ('agente', 'Comercial');

-- ============================================================================
-- ROLLBACK (comentado — no se ejecuta automáticamente)
-- ============================================================================
-- N1 (negocio): volver a dar el flujo libre a un rol puntual sin tocar código ni schema.
--   UPDATE roles SET puede_agregar_cobertura_libre = TRUE WHERE nombre IN ('...');
--
-- N2 (código): revertir el commit de esta migración. La columna
--   `roles.puede_agregar_cobertura_libre` queda inerte (ningún código la vuelve a leer), sin
--   dato huérfano — el cotizador vuelve a mostrar siempre el flujo libre, como antes.
--
-- N3 (schema): revertir también el schema.
--   ALTER TABLE roles DROP COLUMN puede_agregar_cobertura_libre;
