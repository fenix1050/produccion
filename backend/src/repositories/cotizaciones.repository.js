import { supabase } from '../config/supabase.js'
import { httpError } from '../utils/http-error.js'

// Cambio SDD `cotizacion-transaccional`: thin wrappers de UN solo `supabase.rpc()` contra las
// funciones plpgsql `crear_cotizacion_atomica`/`actualizar_cotizacion_atomica` (migración
// 052_cotizacion_atomica_rpc.sql, ya aplicada contra Supabase real). El `payload` ya viene armado
// por `cotizacion.service.js` con las keys `p_*` exactas que espera el RPC — no hay traducción
// acá, solo se reenvía tal cual (ver design.md — Architecture Decision #4/#5). Todo el detalle
// (correlativo, cabecera, coberturas, variantes, ajustes, plan de pago) se persiste dentro de
// una única transacción de Postgres del lado del RPC; el error de Postgres se propaga sin
// envolver, ya que el rollback lo maneja la base, no JS.
export async function crearCotizacionAtomica(payload) {
  const { data, error } = await supabase.rpc('crear_cotizacion_atomica', payload)
  if (error) throw error
  return data
}

export async function actualizarCotizacionAtomica(payload) {
  const { data, error } = await supabase.rpc('actualizar_cotizacion_atomica', payload)
  if (error) throw error
  return data
}

// `*` ya expone `moneda`/`tipo_cambio_snapshot`/`tipo_cambio_fuente`/`tipo_cambio_fecha`
// (migración 034) sin necesidad de listarlas a mano — son columnas reales de `cotizaciones`.
export async function findCotizacionById(id) {
  const { data, error } = await supabase
    .from('cotizaciones')
    .select(
      '*, usuarios(nombre, email, telefono, roles(nombre)), cotizacion_variantes(*, cotizacion_plan_pago(*, formas_pago(*)), cotizacion_ajustes(*)), cotizacion_coberturas(*, coberturas_catalogo(codigo, incluye_en_suma_asegurada_total)), cotizacion_servicios(*), cotizacion_clausulas(*)'
    )
    .eq('id', id)
    .single()
  if (error) {
    // PGRST116 = PostgREST no encontró (o encontró más de una) fila para `.single()` — es el
    // caso "no existe", no una falla real de la base. Se marca acá, en la única función que lee
    // una cotización por id, para que listar/obtener/actualizar devuelvan 404 de forma consistente
    // sin que cada caller tenga que repetir el chequeo (antes solo `actualizarCotizacion` lo hacía
    // con un try/catch que además tapaba errores reales de conexión — detectado en review-reliability).
    if (error.code === 'PGRST116') {
      throw httpError(404, 'Cotización no encontrada', 'Cotización no encontrada')
    }
    throw error
  }
  return data
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
//
// `*` expone `moneda` por fila (migración 034) — el frontend de historial la usa para no sumar
// primas de cotizaciones en monedas distintas (requirement "Historial does not aggregate across
// currencies").
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
    .range(offset, offset + limit - 1)

  if (ramoId) query = query.eq('ramo_id', ramoId)
  if (estado) query = query.eq('estado', estado)
  if (cliente) query = query.ilike('cliente_nombre', `%${cliente}%`)
  if (fechaDesde) query = query.gte('created_at', fechaDesde)
  if (fechaHasta) query = query.lte('created_at', `${fechaHasta}T23:59:59`)
  if (agenteId) query = query.eq('agente_id', agenteId)

  const { data, error, count } = await query
  if (error) throw error
  return { data, count }
}
