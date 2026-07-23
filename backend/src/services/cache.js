// Caché en memoria de proceso para catálogos (coberturas, tasas, rubros) que
// `resolverContextoRepositorios` (cotizacion.service.js) re-consulta en cada preview de
// cotización — el frontend hace debounce de 450ms pero eso solo espaciaba las queries, no
// las evitaba. Estos datos solo cambian cuando un admin edita coberturas/tasas/rubros desde
// el panel admin, así que se cachean acá con invalidación explícita desde esos endpoints,
// más un TTL corto como red de seguridad por si algún endpoint de mutación queda sin
// enganchar la invalidación (o si se agrega uno nuevo y se olvida).
const TTL_MS = 5 * 60 * 1000; // 5 minutos

const store = new Map();

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function set(key, value, ttlMs = TTL_MS) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/**
 * Devuelve el valor cacheado para `key` si es válido, o ejecuta `fetcher` y lo cachea.
 */
export async function withCache(key, fetcher, ttlMs = TTL_MS) {
  const cached = get(key);
  if (cached !== undefined) return cached;
  const value = await fetcher();
  set(key, value, ttlMs);
  return value;
}

// Invalida TODO el caché en vez de por clave puntual: las mutaciones que lo afectan
// (coberturas_catalogo, tasas_cobertura_ramo, rubros_actividad) pasan solo por el panel
// admin —infrecuentes comparado con el flujo de cotización— y el caché entero es chico,
// así que el costo de recalentarlo entero es despreciable frente al riesgo de una
// invalidación parcial que deje una tasa/rubro vieja en memoria.
export function invalidarCacheCatalogos() {
  store.clear();
}
