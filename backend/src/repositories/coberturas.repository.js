import { supabase } from '../config/supabase.js';

// Repository compartido de catálogo de coberturas / tasas / rubros para los ramos de
// "Otros Riesgos" (MRC, Incendio, TRO...). Ver sección 4 de PLAN_DESARROLLO.md.

/**
 * @param {string} [grupo] - 'MRC' | 'TRO' | undefined (todos)
 */
export async function findRubrosActividad(grupo) {
  // order('id'): conserva el orden real de la pantalla "Tipo de Riesgo" del sistema de
  // escritorio (orden de inserción de la migración 012), no alfabético.
  let query = supabase.from('rubros_actividad').select('*').order('id');
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
 *
 * Filtra por vigente_desde <= hoy y se queda con la versión más reciente por
 * cobertura — desde que el panel admin (WU3) puede insertar versiones nuevas
 * de una misma tasa, traer todas las filas sin filtrar hacía que la cotización
 * dependiera del orden no garantizado que devuelve Supabase.
 */
export async function findTasasCoberturaRamo(ramoId) {
  const hoy = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('tasas_cobertura_ramo')
    .select('tasa_valor, unidad, vigente_desde, coberturas_catalogo(codigo)')
    .eq('ramo_id', ramoId)
    .lte('vigente_desde', hoy)
    .order('vigente_desde', { ascending: false });
  if (error) throw error;

  const vigentesPorCodigo = new Map();
  for (const fila of data) {
    const codigo = fila.coberturas_catalogo?.codigo;
    if (codigo && !vigentesPorCodigo.has(codigo)) {
      vigentesPorCodigo.set(codigo, fila);
    }
  }
  return [...vigentesPorCodigo.values()];
}

/**
 * Filas de `tarifas_generico` de un plan (usado por Vida y Accidentes Personales — tarificación
 * que no encaja en tasa fija por ramo ni en tasa por capital, ver migración 015/016). Cada fila
 * es un JSONB en `variables` con su propia forma según `variables.tipo` o las claves presentes
 * (franja etaria, monto fijo, reducción de capital, etc.) — no se interpreta acá, solo se trae.
 */
export async function findTarifasGenericoByPlanId(planId) {
  const { data, error } = await supabase
    .from('tarifas_generico')
    .select('variables')
    .eq('plan_id', planId);
  if (error) throw error;
  return data.map((row) => row.variables);
}

// --- Fase 5 / WU3: panel admin ---

/**
 * Coberturas de un plan (plan_coberturas) con el detalle del catálogo embebido —
 * para la pantalla admin de "coberturas por defecto del plan".
 */
export async function findPlanCoberturasByPlanId(planId) {
  const { data, error } = await supabase
    .from('plan_coberturas')
    .select('*, coberturas_catalogo(*)')
    .eq('plan_id', planId)
    .order('id');
  if (error) throw error;
  return data;
}

export async function crearPlanCobertura(planId, { cobertura_id, incluida_por_defecto, monto, franquicia }) {
  const { data, error } = await supabase
    .from('plan_coberturas')
    .insert({ plan_id: planId, cobertura_id, incluida_por_defecto, monto, franquicia })
    .select('*, coberturas_catalogo(*)')
    .single();
  if (error) throw error;
  return data;
}

export async function actualizarPlanCobertura(id, cambios) {
  const { data, error } = await supabase
    .from('plan_coberturas')
    .update(cambios)
    .eq('id', id)
    .select('*, coberturas_catalogo(*)')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function eliminarPlanCobertura(id) {
  const { error } = await supabase.from('plan_coberturas').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Historial COMPLETO de tasas_cobertura_ramo de un ramo (todas las versiones por
 * vigente_desde, no solo la vigente) — a diferencia de findTasasCoberturaRamo, que
 * usan los calculadores en tiempo de cotización y trae todas las filas sin filtrar
 * por fecha (ver nota de bug en admin.service.js).
 */
export async function findTasasCoberturaRamoConHistorial(ramoId) {
  const { data, error } = await supabase
    .from('tasas_cobertura_ramo')
    .select('*, coberturas_catalogo(id, codigo, nombre)')
    .eq('ramo_id', ramoId)
    .order('vigente_desde', { ascending: false });
  if (error) throw error;
  return data;
}

// Inserta una versión NUEVA — nunca UPDATE. Ver decisión de "versionado por
// inserción" en docs/PLAN_ADMIN_FASE5.md.
export async function crearTasaCoberturaRamo(ramoId, { cobertura_id, tasa_valor, unidad, vigente_desde }) {
  const { data, error } = await supabase
    .from('tasas_cobertura_ramo')
    .insert({
      ramo_id: ramoId,
      cobertura_id,
      tasa_valor,
      unidad,
      vigente_desde: vigente_desde ?? new Date().toISOString().slice(0, 10),
    })
    .select('*, coberturas_catalogo(id, codigo, nombre)')
    .single();
  if (error) throw error;
  return data;
}
