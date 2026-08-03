// Cache en memoria (a nivel de módulo) del catálogo de ramos activos — admin.js, cotizar.js
// e historial.js pedían GET /ramos cada uno por su cuenta, con guards ad-hoc distintos en
// cada punto de llamada. Solo dedupe fetches dentro de la misma carga de página: cada módulo
// (/admin, /cotizar, /historial) es una recarga completa de página, así que el cache no
// persiste entre navegaciones — ese límite es aceptable, es el mismo comportamiento de hoy.
import { api } from './api.js'

let ramosPromise = null

export function getRamos() {
  if (!ramosPromise) {
    ramosPromise = api.get('/ramos').catch((err) => {
      ramosPromise = null
      throw err
    })
  }
  return ramosPromise
}
