import { supabase } from '../config/supabase.js'

// Repository de `tipos_cambio` (migración 037) — historial append-only del tipo de cambio
// obtenido de dolarPy (o cargado a mano como salvavidas admin). Nunca se hace UPDATE de una
// fila existente: "vigente" es siempre la fila más reciente por moneda.

/**
 * Última fila persistida para `moneda`, o `null` si nunca se guardó ninguna. Es el fallback
 * que usa tipo-cambio.service.js cuando el fetch a dolarPy falla.
 * @param {string} moneda - 'USD' (única moneda soportada hoy)
 */
export async function findUltimoVigente(moneda = 'USD') {
  const { data, error } = await supabase
    .from('tipos_cambio')
    .select('*')
    .eq('moneda', moneda)
    .order('obtenido_en', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Inserta una fila nueva — nunca UPDATE (append-only, ver comentario de la migración 037).
 * @param {object} datos
 * @param {string} [datos.moneda]
 * @param {string} [datos.fuente]
 * @param {number|null} [datos.compra]
 * @param {number} datos.venta
 * @param {'api'|'manual'} [datos.origen]
 */
export async function insertTipoCambio({
  moneda = 'USD',
  fuente = 'dolarpy:set',
  compra = null,
  venta,
  origen = 'api',
}) {
  const { data, error } = await supabase
    .from('tipos_cambio')
    .insert({ moneda, fuente, compra, venta, origen })
    .select('*')
    .single()
  if (error) throw error
  return data
}
