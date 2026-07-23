// Costo de hashing de bcrypt, compartido entre auth.service.js (cambio de contraseña
// propia) y admin/usuarios.service.js (alta/reset de contraseña por un admin) — antes
// duplicado en ambos archivos.
export const BCRYPT_ROUNDS = 12;
