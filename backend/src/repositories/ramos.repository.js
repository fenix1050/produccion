import { supabase } from '../config/supabase.js'

export async function findRamosActivos() {
  const { data, error } = await supabase.from('ramos').select('*').eq('activo', true)
  if (error) throw error
  return data
}

// `soloActivos` preserva, cuando se pide, el mismo filtro que aplicaba `findRamosActivos()`
// antes de que este método existiera. `validarYResolverContexto` (alta/edición de cotización)
// lo necesita en true para no dejar cotizar un ramo dado de baja; `generarPdfOferta` lo deja en
// false porque una cotización histórica no debe fallar solo porque el ramo se desactivó después.
export async function findRamoById(ramoId, { soloActivos = false } = {}) {
  let query = supabase.from('ramos').select('*').eq('id', ramoId)
  if (soloActivos) query = query.eq('activo', true)
  const { data, error } = await query.single()
  if (error) throw error
  return data
}

// A diferencia de findRamosActivos (usado por el cotizador — solo ramos habilitados),
// el panel admin necesita ver también los inactivos para poder reactivarlos.
export async function findAllRamos() {
  const { data, error } = await supabase.from('ramos').select('*').order('id')
  if (error) throw error
  return data
}

export async function actualizarRamo(id, cambios) {
  const { data, error } = await supabase
    .from('ramos')
    .update(cambios)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) throw error
  return data
}

export async function findPlanesByRamoId(ramoId) {
  const { data, error } = await supabase
    .from('planes')
    .select('*')
    .eq('ramo_id', ramoId)
    .eq('activo', true)
  if (error) throw error
  return data
}

export async function findPlanById(planId) {
  const { data, error } = await supabase.from('planes').select('*').eq('id', planId).single()
  if (error) throw error
  return data
}

export async function findCoberturasByPlanId(planId) {
  const { data, error } = await supabase
    .from('plan_coberturas')
    .select('*, coberturas_catalogo(*)')
    .eq('plan_id', planId)
  if (error) throw error
  return data
}

export async function findTasaCapital(planId, capital) {
  const { data, error } = await supabase
    .from('tasas_capital')
    .select('*')
    .eq('plan_id', planId)
    .lte('capital_min', capital)
    .gte('capital_max', capital)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function findFormasPagoDelPlan(planId) {
  const { data, error } = await supabase
    .from('plan_formas_pago')
    .select('*, formas_pago(*)')
    .eq('plan_id', planId)
    .eq('habilitada', true)
  if (error) throw error
  return data
}

// A diferencia de findFormasPagoDelPlan (usado por el motor de cotización, que solo debe
// ver formas de pago habilitadas), esta trae TODAS — el admin necesita ver y poder
// reactivar una forma de pago deshabilitada, no solo las que ya están activas.
/**
 * Cláusulas legales OBLIGATORIAS de un plan específico (`clausulas_catalogo.plan_id`,
 * migración 038) — a diferencia del catálogo genérico por ramo (`plan_id IS NULL`,
 * seleccionable a mano por cotización en `cotizacion_clausulas`), estas son fijas del plan
 * (ej. las 5 cláusulas de "INCENDIO HIPOTECARIO", ver
 * openspec/changes/incendio-3-planes-y-moneda/specs/incendio-planes-objeto-riesgo/spec.md
 * "Hipotecario legal content"). Un plan sin cláusulas propias (todas sus filas con
 * `plan_id` NULL) devuelve lista vacía — no rompe nada.
 */
export async function findClausulasObligatoriasByPlanId(planId) {
  const { data, error } = await supabase
    .from('clausulas_catalogo')
    .select('*')
    .eq('plan_id', planId)
    .eq('activo', true)
    .order('id')
  if (error) throw error
  return data
}

export async function findFormasPagoDelPlanTodas(planId) {
  const { data, error } = await supabase
    .from('plan_formas_pago')
    .select('*, formas_pago(*)')
    .eq('plan_id', planId)
  if (error) throw error
  return data
}
