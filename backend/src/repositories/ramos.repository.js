import { supabase } from '../config/supabase.js';

export async function findRamosActivos() {
  const { data, error } = await supabase.from('ramos').select('*').eq('activo', true);
  if (error) throw error;
  return data;
}

// `soloActivos` preserva, cuando se pide, el mismo filtro que aplicaba `findRamosActivos()`
// antes de que este método existiera. `validarYResolverContexto` (alta/edición de cotización)
// lo necesita en true para no dejar cotizar un ramo dado de baja; `generarPdfOferta` lo deja en
// false porque una cotización histórica no debe fallar solo porque el ramo se desactivó después.
export async function findRamoById(ramoId, { soloActivos = false } = {}) {
  let query = supabase.from('ramos').select('*').eq('id', ramoId);
  if (soloActivos) query = query.eq('activo', true);
  const { data, error } = await query.single();
  if (error) throw error;
  return data;
}

export async function findPlanesByRamoId(ramoId) {
  const { data, error } = await supabase
    .from('planes')
    .select('*')
    .eq('ramo_id', ramoId)
    .eq('activo', true);
  if (error) throw error;
  return data;
}

export async function findPlanById(planId) {
  const { data, error } = await supabase.from('planes').select('*').eq('id', planId).single();
  if (error) throw error;
  return data;
}

export async function findCoberturasByPlanId(planId) {
  const { data, error } = await supabase
    .from('plan_coberturas')
    .select('*, coberturas_catalogo(*)')
    .eq('plan_id', planId);
  if (error) throw error;
  return data;
}

export async function findTasaCapital(planId, capital) {
  const { data, error } = await supabase
    .from('tasas_capital')
    .select('*')
    .eq('plan_id', planId)
    .lte('capital_min', capital)
    .gte('capital_max', capital)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function findFormasPagoDelPlan(planId) {
  const { data, error } = await supabase
    .from('plan_formas_pago')
    .select('*, formas_pago(*)')
    .eq('plan_id', planId)
    .eq('habilitada', true);
  if (error) throw error;
  return data;
}

// A diferencia de findFormasPagoDelPlan (usado por el motor de cotización, que solo debe
// ver formas de pago habilitadas), esta trae TODAS — el admin necesita ver y poder
// reactivar una forma de pago deshabilitada, no solo las que ya están activas.
export async function findFormasPagoDelPlanTodas(planId) {
  const { data, error } = await supabase
    .from('plan_formas_pago')
    .select('*, formas_pago(*)')
    .eq('plan_id', planId);
  if (error) throw error;
  return data;
}
