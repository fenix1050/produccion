// Códigos de error de Postgres (ver https://www.postgresql.org/docs/current/errcodes-appendix.html),
// usados por los services para distinguir violaciones de constraint del resto de errores de
// Supabase y mapearlas a un 409 con mensaje de negocio propio de cada recurso.
export const CODIGO_UNIQUE_VIOLATION = '23505'
export const CODIGO_FOREIGN_KEY_VIOLATION = '23503'
// PostgREST (no Postgres): `.single()` sin filas -> "JSON object requested, multiple (or no) rows".
export const CODIGO_POSTGREST_SIN_FILAS = 'PGRST116'
