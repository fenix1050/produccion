// Logger silencioso en producción: cualquier usuario puede abrir la consola del
// navegador, y ahí no queremos exponer errores internos de la app (sí en local,
// donde loguear ayuda a debuggear).
const ES_LOCAL = ['localhost', '127.0.0.1'].includes(window.location.hostname)

export const logger = {
  error: (...args) => {
    if (ES_LOCAL) console.error(...args)
  },
}
