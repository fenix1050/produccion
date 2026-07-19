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

// Descuento/recargo manual del agente (state.data.descuentoValor/recargoValor en cotizar.js) —
// tabla `cotizacion_ajustes` ya existía en el schema (migración 003) sin uso hasta ahora. Se
// persiste el total YA topado por el calculador (sumarAjustes), no el ajuste crudo que mandó el
// frontend, para que la Carta Oferta muestre exactamente lo que se cobró.
export async function insertAjustes(ajustes) {
  if (!ajustes.length) return [];
  const { data, error } = await supabase.from('cotizacion_ajustes').insert(ajustes).select();
  if (error) throw error;
  return data;
}

// Borran filas por ID explícito (no un DELETE ciego por cotizacion_id) — actualizarCotizacion en
// cotizacion.service.js inserta las filas nuevas ANTES de borrar las viejas, y ambas comparten el
// mismo cotizacion_id, así que un DELETE por cotizacion_id se llevaría puestas también las recién
// insertadas.
export async function deleteVariantesByIds(ids) {
  if (!ids.length) return;
  const { error } = await supabase.from('cotizacion_variantes').delete().in('id', ids);
  if (error) throw error;
}

export async function deleteCoberturasByIds(ids) {
  if (!ids.length) return;
  const { error } = await supabase.from('cotizacion_coberturas').delete().in('id', ids);
  if (error) throw error;
}

export async function updateCotizacion(id, fields) {
  const { data, error } = await supabase
    .from('cotizaciones')
    .update(fields)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function findCotizacionById(id) {
  const { data, error } = await supabase
    .from('cotizaciones')
    .select(
      '*, cotizacion_variantes(*, cotizacion_plan_pago(*, formas_pago(*)), cotizacion_ajustes(*)), cotizacion_coberturas(*, coberturas_catalogo(codigo, incluye_en_suma_asegurada_total))'
    )
    .eq('id', id)
    .single();
  if (error) {
    // PGRST116 = PostgREST no encontró (o encontró más de una) fila para `.single()` — es el
    // caso "no existe", no una falla real de la base. Se marca acá, en la única función que lee
    // una cotización por id, para que listar/obtener/actualizar devuelvan 404 de forma consistente
    // sin que cada caller tenga que repetir el chequeo (antes solo `actualizarCotizacion` lo hacía
    // con un try/catch que además tapaba errores reales de conexión — detectado en review-reliability).
    if (error.code === 'PGRST116') {
      const notFound = new Error('Cotización no encontrada');
      notFound.status = 404;
      notFound.publicMessage = notFound.message;
      throw notFound;
    }
    throw error;
  }
  return data;
}

// El listado de Historial (frontend/historial) necesita nombre de ramo/plan y una prima
// representativa por fila sin caer en N+1 requests — se traen embebidos vía joins de
// Supabase (FK ya declaradas: cotizaciones.ramo_id -> ramos.id, cotizaciones.plan_id ->
// planes.id, cotizacion_variantes.cotizacion_id -> cotizaciones.id).
//
// De `cotizacion_variantes` solo se trae `tipo_franquicia` + `prima`: la prima NO varía por
// forma de pago (eso vive en cotizacion_plan_pago.premio_total, que sí varía por RPF), varía
// solo por variante de franquicia (sin_franquicia / con_franquicia, exclusivo de Auto — Fase
// 1/2, pausada). MRC/Incendio/Vida-AP (únicos ramos activos hoy) generan siempre una única
// variante `sin_franquicia` por cotización, así que no hay ambigüedad real al elegirla en el
// frontend (ver historial.js, primaRepresentativa()).
export async function findCotizaciones({
  ramoId,
  estado,
  cliente,
  fechaDesde,
  fechaHasta,
  limit = 20,
  offset = 0,
  agenteId,
} = {}) {
  let query = supabase
    .from('cotizaciones')
    // `ramos.calculador` viaja embebido para que el frontend decida el botón "Descargar Carta
    // Oferta" fila por fila sin pegarle a /ramos de nuevo (mismo criterio que
    // BUILDERS_POR_CALCULADOR en backend/src/templates/oferta/index.js: hoy solo 'mrc').
    .select(
      '*, ramos(nombre_display, calculador), planes(nombre), cotizacion_variantes(tipo_franquicia, prima)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (ramoId) query = query.eq('ramo_id', ramoId);
  if (estado) query = query.eq('estado', estado);
  if (cliente) query = query.ilike('cliente_nombre', `%${cliente}%`);
  if (fechaDesde) query = query.gte('created_at', fechaDesde);
  if (fechaHasta) query = query.lte('created_at', `${fechaHasta}T23:59:59`);
  if (agenteId) query = query.eq('agente_id', agenteId);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count };
}
