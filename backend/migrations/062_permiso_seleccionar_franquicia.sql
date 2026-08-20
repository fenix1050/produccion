-- Controls whether a non-admin role can choose MRC deductibles. Admin retains an explicit
-- application-level bypass; every other role starts restricted until this permission is granted.
ALTER TABLE roles ADD COLUMN puede_seleccionar_franquicia BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================================
-- ROLLBACK (commented — not run automatically)
-- ============================================================================
-- ALTER TABLE roles DROP COLUMN puede_seleccionar_franquicia;
