// Validación previa al POST /auth/login. El form usa `novalidate`, así que sin esto un
// envío vacío viaja igual a la API (400 de Zod) y cuenta contra el rate limit de login.
// Refleja loginSchema del backend: email requerido con formato válido, password
// requerida sin recortar (el backend solo exige min(1)).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validarCredenciales({ email, password }) {
  const emailVacio = email.trim() === ''
  const passwordVacia = password === ''

  if (emailVacio && passwordVacia) return 'Ingresá tu email y tu contraseña.'
  if (emailVacio) return 'Ingresá tu email.'
  if (passwordVacia) return 'Ingresá tu contraseña.'
  if (!EMAIL_RE.test(email.trim())) return 'El email no tiene un formato válido.'
  return null
}
