import { supabase } from '../config/supabase.js';

export async function findRamosActivos() {
  const { data, error } = await supabase.from('ramos').select('*').eq('activo', true);
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
