import { httpError } from '../utils/http-error.js'

// Postgres no admite U+0000 en text/jsonb (`22P05`): si llega a la DB, la request termina en 500.
// Se corta acá con 400. Recorrido iterativo (no recursivo) para que un body con anidamiento
// extremo no desborde la pila; el body ya viene acotado por el `limit` de express.json.
function contieneByteNulo(valor) {
  const pendientes = [valor]
  while (pendientes.length > 0) {
    const actual = pendientes.pop()
    if (typeof actual === 'string') {
      if (actual.includes('\u0000')) return true
    } else if (Array.isArray(actual)) {
      // for-of y no push(...actual): un array de ~1M elementos reventaría el límite de argumentos.
      for (const elemento of actual) pendientes.push(elemento)
    } else if (actual !== null && typeof actual === 'object') {
      for (const clave of Object.keys(actual)) {
        if (clave.includes('\u0000')) return true
        pendientes.push(actual[clave])
      }
    }
  }
  return false
}

export function rechazarBytesNulos(req, _res, next) {
  if (contieneByteNulo(req.body)) {
    return next(httpError(400, 'El cuerpo de la solicitud contiene un byte nulo no permitido'))
  }
  next()
}
