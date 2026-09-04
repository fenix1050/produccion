-- PF-3 MRC
-- Completa los privilegios mínimos que necesita el backend al operar
-- mediante la service_role. Los RPC PF-3 son SECURITY INVOKER, por lo
-- que EXECUTE por sí solo no concede acceso a sus tablas/secuencias.

-- Lectura directa de textos oficiales y RPC publicar_texto_propuesta():
-- SELECT para listar/versionar/RETURNING,
-- UPDATE para despublicar la versión vigente,
-- INSERT para crear la nueva versión.
GRANT SELECT, INSERT, UPDATE
ON TABLE public.propuesta_textos
TO service_role;

GRANT USAGE
ON SEQUENCE public.propuesta_textos_id_seq
TO service_role;

-- iniciar_emision_propuesta_formal():
-- INSERT ... ON CONFLICT DO UPDATE ... RETURNING ultimo_numero
-- necesita INSERT, UPDATE y SELECT sobre el correlativo.
GRANT SELECT, INSERT, UPDATE
ON TABLE public.propuesta_correlativos
TO service_role;

-- Auditoría documental generada por emisión, confirmación,
-- error de PDF y anulación.
GRANT INSERT
ON TABLE public.propuesta_formal_eventos
TO service_role;

GRANT USAGE
ON SEQUENCE public.propuesta_formal_eventos_id_seq
TO service_role;

-- Reafirmar que los roles de navegador no acceden directamente
-- a estos objetos internos.
REVOKE ALL PRIVILEGES
ON TABLE
  public.propuesta_textos,
  public.propuesta_correlativos,
  public.propuesta_formal_eventos
FROM anon, authenticated;

REVOKE ALL PRIVILEGES
ON SEQUENCE
  public.propuesta_textos_id_seq,
  public.propuesta_formal_eventos_id_seq
FROM anon, authenticated;
