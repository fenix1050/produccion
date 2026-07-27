import { findUltimoVigente, insertTipoCambio } from '../repositories/tipos-cambio.repository.js'
import { httpError } from '../utils/http-error.js'

import { withCache } from './cache.js'

// Servicio de tipo de cambio — fetch on-demand a la API pública de dolarPy con caché TTL 15 min
// (alineado con el refresco de ~10 min del scraper de origen) y fallback a la última fila
// persistida en `tipos_cambio` si el fetch falla. Nunca lanza por una falla de red: solo lanza
// 422 si no hay fetch exitoso NI valor previo en base (ver design.md "Interfaces / Contracts" y
// "Threat Matrix"). Todavía no lo consume nadie en este PR — se integra en cotizacion.service.js
// en el PR 3 (grupo 5).

const DOLARPY_URL = 'https://dolar.melizeche.com/api/1.0/'
const FETCH_TIMEOUT_MS = 3000
const CACHE_TTL_MS = 15 * 60 * 1000
const FUENTE_DOLARPY = 'dolarpy:set'

/**
 * Devuelve el tipo de cambio vigente. Nunca lanza por falla de red: si el fetch a dolarPy
 * falla, hace timeout o devuelve un shape inesperado, cae al último valor persistido en
 * `tipos_cambio` y lo marca `stale: true` (se loguea WARN, no bloquea la cotización).
 * Solo lanza 422 si no hay fetch exitoso NI valor previo en base.
 * @param {{moneda?: string}} [params]
 * @returns {Promise<{venta:number, compra:number|null, obtenido_en:string,
 *                    fuente:string, origen:'api'|'manual', stale:boolean}>}
 */
export async function obtenerTipoCambioVigente({ moneda = 'USD' } = {}) {
  return withCache(`tipo_cambio:${moneda}`, () => resolverTipoCambio(moneda), CACHE_TTL_MS)
}

async function resolverTipoCambio(moneda) {
  const fresco = await intentarFetchDolarPy(moneda)
  if (fresco) {
    const persistido = await insertTipoCambio({
      moneda,
      fuente: FUENTE_DOLARPY,
      compra: fresco.compra,
      venta: fresco.venta,
      origen: 'api',
    })
    return {
      venta: persistido.venta,
      compra: persistido.compra,
      obtenido_en: persistido.obtenido_en,
      fuente: persistido.fuente,
      origen: persistido.origen,
      stale: false,
    }
  }

  const ultimo = await findUltimoVigente(moneda)
  if (!ultimo) {
    throw httpError(
      422,
      `No hay tipo de cambio disponible para ${moneda}: dolarPy no respondió y no hay ningún valor previo en tipos_cambio.`,
      'No se pudo obtener el tipo de cambio en este momento. Intente nuevamente en unos minutos.'
    )
  }

  console.warn(
    `[tipo-cambio] usando valor stale de tipos_cambio (moneda=${moneda}, obtenido_en=${ultimo.obtenido_en}) porque dolarPy no respondió`
  )

  return {
    venta: ultimo.venta,
    compra: ultimo.compra,
    obtenido_en: ultimo.obtenido_en,
    fuente: ultimo.fuente,
    origen: ultimo.origen,
    stale: true,
  }
}

// Nunca propaga la excepción del fetch hacia arriba: cualquier falla (timeout, HTTP 4xx/5xx,
// JSON malformado, shape inesperado) se traduce en `null` para que resolverTipoCambio() caiga
// al fallback de DB.
async function intentarFetchDolarPy(moneda) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetchDolarPy(controller.signal)
  } catch (err) {
    console.warn(`[tipo-cambio] fetch a dolarPy falló (moneda=${moneda}): ${err.message}`)
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

async function fetchDolarPy(signal) {
  const res = await fetch(DOLARPY_URL, { signal })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const body = await res.json()
  const set = body?.dolarpy?.set
  const venta = Number(set?.venta)
  if (!set || !Number.isFinite(venta)) {
    throw new Error('respuesta de dolarPy sin dolarpy.set.venta numérico')
  }
  const compra = Number(set?.compra)
  return { venta, compra: Number.isFinite(compra) ? compra : null }
}

/**
 * Override manual desde el panel admin — salvavidas si dolarPy queda caído por un período
 * prolongado. No requiere UI en este cambio: alcanza con poder invocarla (ver design.md,
 * open question de "override manual" pendiente de UI).
 * @param {{moneda?: string, compra?: number, venta: number, usuario?: string}} params
 */
export async function registrarTipoCambioManual({ moneda = 'USD', compra, venta, usuario }) {
  if (!Number.isFinite(venta)) {
    throw httpError(422, 'El tipo de cambio manual requiere un valor "venta" numérico.')
  }
  return insertTipoCambio({
    moneda,
    fuente: usuario ? `manual:${usuario}` : 'manual',
    compra: Number.isFinite(compra) ? compra : null,
    venta,
    origen: 'manual',
  })
}
