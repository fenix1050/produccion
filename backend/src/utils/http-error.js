/**
 * Arma un Error con `.status` y `.publicMessage` ya seteados, para no repetir el patrón
 * `const err = new Error(...); err.status = ...; err.publicMessage = ...; throw err;` en cada
 * capa. `publicMessage` default a `message`: todo caller de `httpError()` ya redacta un texto
 * seguro para el cliente (ese es el propósito de usar este helper en vez de `new Error()`
 * crudo), así que sin este default el mensaje real nunca llegaba al cliente y `app.js` mostraba
 * siempre "Error interno del servidor" — incluso en 401/403/404 esperados. Pasar un
 * `publicMessage` explícito solo hace falta cuando querés loguear más detalle interno en
 * `message` que el que se expone al cliente.
 *
 * @param {number} status
 * @param {string} message
 * @param {string} [publicMessage]
 * @returns {Error & { status: number, publicMessage: string }}
 */
export function httpError(status, message, publicMessage = message) {
  const err = new Error(message);
  err.status = status;
  err.publicMessage = publicMessage;
  return err;
}
