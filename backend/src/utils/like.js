// Escapa los comodines de LIKE/ILIKE (`%`, `_`) y el propio escape (`\`, el de por defecto en
// PostgreSQL) para que el texto que escribe el usuario se busque como literal.
export function escaparLike(texto) {
  return String(texto).replace(/[\\%_]/g, '\\$&')
}
