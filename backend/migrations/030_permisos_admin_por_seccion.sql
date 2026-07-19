-- 030_permisos_admin_por_seccion.sql
-- Fase 5: permisos parciales del panel admin por sección, mismo patrón ya usado por
-- `puede_editar_tasas` (que NO se toca acá, ya existe desde una migración anterior).
-- Permite darle a un usuario acceso a SOLO una sección del panel admin (ej. Coberturas
-- por plan) sin hacerlo admin completo. Ver docs/ESTADO_PROYECTO.md sección 20a2 para
-- el plan aprobado completo.
--
-- NOTA de evolución futura (no implementada acá): si más adelante se necesita un
-- sistema de roles configurable desde el panel (sin tocar código), estas columnas
-- booleanas pasarían a ser filas de una tabla de permisos por rol.

ALTER TABLE usuarios
  ADD COLUMN puede_gestionar_usuarios BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN puede_editar_coberturas BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN puede_editar_planes BOOLEAN NOT NULL DEFAULT FALSE;
