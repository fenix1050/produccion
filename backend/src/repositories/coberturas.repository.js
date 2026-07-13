import { supabase } from '../config/supabase.js';

// Repository compartido de catálogo de coberturas / tasas / rubros para los ramos de
// "Otros Riesgos" (MRC, Incendio, TRO...). Ver sección 4 de PLAN_DESARROLLO.md.

/**
 * @param {string} [grupo] - 'MRC' | 'TRO' | undefined (todos)
 */
export async function findRubrosActividad(grupo) {
  let query = supabase.from('rubros_actividad').select('*').order('nombre');
  if (grupo) query = query.eq('grupo', grupo);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function findRubroPorNombre(nombre) {
  const { data, error } = await supabase
    .from('rubros_actividad')
    .select('*')
    .eq('nombre', nombre)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function findCoberturasCatalogoByRamoId(ramoId) {
  const { data, error } = await supabase
    .from('coberturas_catalogo')
    .select('*')
    .eq('ramo_id', ramoId)
    .eq('activo', true);
  if (error) throw error;
  return data;
}

/**
 * Tasas ‰ (o %) por línea de cobertura de un ramo, con el código de la cobertura
 * ya resuelto (join contra coberturas_catalogo) para poder indexar por código.
 */
export async function findTasasCoberturaRamo(ramoId) {
  const { data, error } = await supabase
    .from('tasas_cobertura_ramo')
    .select('tasa_valor, unidad, coberturas_catalogo(codigo)')
    .eq('ramo_id', ramoId);
  if (error) throw error;
  return data;
}
