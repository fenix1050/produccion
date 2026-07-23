/**
 * Arma un Error con `.status` y (opcionalmente) `.publicMessage` ya seteados, para no repetir
 * el patrón `const err = new Error(...); err.status = ...; err.publicMessage = ...; throw err;`
 * en cada capa. `publicMessage` queda `undefined` si no se pasa (mismo comportamiento que no
 * asignarlo nunca): `app.js` hace `err.publicMessage || 'Error interno del servidor'`, así que
 * omitirlo sigue devolviendo el mensaje genérico al cliente.
 *
 * @param {number} status
 * @param {string} message
 * @param {string} [publicMessage]
 * @returns {Error & { status: number, publicMessage?: string }}
 */
export function httpError(status, message, publicMessage) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = publicMessage;
  return err;
}
