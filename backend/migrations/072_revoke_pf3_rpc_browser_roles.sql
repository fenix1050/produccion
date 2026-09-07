-- PF-3 security: public RPCs are called only by the trusted backend service role.
-- Explicit grants to browser roles may survive REVOKE ... FROM PUBLIC in Supabase.
REVOKE EXECUTE ON FUNCTION public.publicar_texto_propuesta(TEXT, TEXT, TEXT, TEXT, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.publicar_texto_propuesta(TEXT, TEXT, TEXT, TEXT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.publicar_texto_propuesta(TEXT, TEXT, TEXT, TEXT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.iniciar_emision_propuesta_formal(BIGINT, INT, JSONB, TEXT, TEXT, TEXT, JSONB, INT, BOOLEAN) FROM anon;
REVOKE EXECUTE ON FUNCTION public.iniciar_emision_propuesta_formal(BIGINT, INT, JSONB, TEXT, TEXT, TEXT, JSONB, INT, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.iniciar_emision_propuesta_formal(BIGINT, INT, JSONB, TEXT, TEXT, TEXT, JSONB, INT, BOOLEAN) TO service_role;

REVOKE EXECUTE ON FUNCTION public.actualizar_snapshot_emision_propuesta_formal(BIGINT, JSONB, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.actualizar_snapshot_emision_propuesta_formal(BIGINT, JSONB, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_snapshot_emision_propuesta_formal(BIGINT, JSONB, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.confirmar_emision_propuesta_formal(BIGINT, TEXT, TEXT, INT, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.confirmar_emision_propuesta_formal(BIGINT, TEXT, TEXT, INT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_emision_propuesta_formal(BIGINT, TEXT, TEXT, INT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.registrar_error_emision_propuesta_formal(BIGINT, TEXT, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.registrar_error_emision_propuesta_formal(BIGINT, TEXT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_error_emision_propuesta_formal(BIGINT, TEXT, INT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.anular_propuesta_formal(BIGINT, TEXT, INT, BOOLEAN) FROM anon;
REVOKE EXECUTE ON FUNCTION public.anular_propuesta_formal(BIGINT, TEXT, INT, BOOLEAN) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.anular_propuesta_formal(BIGINT, TEXT, INT, BOOLEAN) TO service_role;
