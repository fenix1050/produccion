import { supabase } from '../config/supabase.js';

export async function nextNumeroCorrelativo(ramoId) {
  // Incrementa y devuelve el próximo número correlativo del ramo vía RPC
  // (función `siguiente_correlativo`, migración 009) para que el incremento
  // sea atómico bajo concurrencia — el UPDATE ... RETURNING toma el lock de
  // fila dentro de la misma transacción, sin el hueco select→update en dos pasos.
  const { data, error } = await supabase.rpc('siguiente_correlativo', { p_ramo_id: ramoId });
  if (error) throw error;
  return data;
}

export async function insertCotizacion(cotizacion) {
  const { data, error } = await supabase.from('cotizaciones').insert(cotizacion).select().single();
  if (error) throw error;
  return data;
}

export async function insertVariante(variante) {
  const { data, error } = await supabase
    .from('cotizacion_variantes')
    .insert(variante)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function insertPlanesPago(planesPago) {
  const { data, error } = await supabase.from('cotizacion_plan_pago').insert(planesPago).select();
  if (error) throw error;
  return data;
}

export async function insertCoberturas(coberturas) {
  const { data, error } = await supabase.from('cotizacion_coberturas').insert(coberturas).select();
  if (error) throw error;
  return data;
}

export async function findCotizacionById(id) {
  const { data, error } = await supabase
    .from('cotizaciones')
    .select(
      '*, cotizacion_variantes(*, cotizacion_plan_pago(*, formas_pago(*))), cotizacion_coberturas(*, coberturas_catalogo(codigo, incluye_en_suma_asegurada_total))'
    )
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function findCotizaciones({ ramoId, estado, cliente, limit = 20, offset = 0 } = {}) {
  let query = supabase
    .from('cotizaciones')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (ramoId) query = query.eq('ramo_id', ramoId);
  if (estado) query = query.eq('estado', estado);
  if (cliente) query = query.ilike('cliente_nombre', `%${cliente}%`);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count };
}
