import { supabase } from '../config/supabase.js';

export async function findPlanByCodigoTasa(codigoTasa) {
  const { data, error } = await supabase
    .from('planes')
    .select('id, nombre, codigo_tasa')
    .eq('codigo_tasa', codigoTasa)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Reemplaza por completo las tasas de un plan (borrar + reinsertar) en vez de
// versionar con `vigente_desde`: tasas_capital hoy sólo representa la tarifa
// vigente (no hay requisito de histórico todavía), así que mantener una sola
// fila activa por rango es más simple que acumular versiones y filtrar por fecha.
export async function reemplazarTasasCapitalDePlan(planId, filas) {
  const { error: deleteError } = await supabase.from('tasas_capital').delete().eq('plan_id', planId);
  if (deleteError) throw deleteError;

  if (filas.length === 0) return [];

  const registros = filas.map((fila) => ({
    plan_id: planId,
    capital_min: fila.capital_min,
    capital_max: fila.capital_max,
    tasa_porcentaje: fila.tasa_porcentaje,
  }));

  const { data, error } = await supabase.from('tasas_capital').insert(registros).select();
  if (error) throw error;
  return data;
}

// --- Fase 5 / WU3: panel admin de planes ---

export async function findAllPlanes(ramoId) {
  let query = supabase.from('planes').select('*, ramos(id, nombre, nombre_display)').order('id');
  if (ramoId) query = query.eq('ramo_id', ramoId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function findPlanById(id) {
  const { data, error } = await supabase.from('planes').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function actualizarPlan(id, cambios) {
  const { data, error } = await supabase
    .from('planes')
    .update(cambios)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function findPlanFormaPagoById(id) {
  const { data, error } = await supabase
    .from('plan_formas_pago')
    .select('*, formas_pago(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function actualizarPlanFormaPago(id, cambios) {
  const { data, error } = await supabase
    .from('plan_formas_pago')
    .update(cambios)
    .eq('id', id)
    .select('*, formas_pago(*)')
    .maybeSingle();
  if (error) throw error;
  return data;
}
