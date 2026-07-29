import { supabase } from '../config/supabase.js'

// Repository compartido de catálogo de coberturas / tasas / rubros para los ramos de
// "Otros Riesgos" (MRC, Incendio, TRO...). Ver sección 4 de PLAN_DESARROLLO.md.

/**
 * Rubros de actividad ofrecidos por UN ramo (cambio "incendio-tasas-por-rubro"): la
 * pertenencia rubro↔ramo ya no vive en el escalar `rubros_actividad.grupo` (legacy,
 * un solo valor, no se toca acá) sino en la relación muchos-a-muchos
 * `rubro_actividad_ramo`. `!inner` convierte el embed en JOIN real — sin él,
 * PostgREST devolvería TODOS los rubros con el embed en `[]` cuando no matchea, en
 * vez de filtrar. La PK compuesta de `rubro_actividad_ramo` garantiza <=1 fila por
 * (rubro, ramo), así que el JOIN no puede duplicar un rubro multi-ramo dentro de la
 * respuesta de un mismo ramo.
 *
 * @param {number} ramoId
 */
export async function findRubrosActividad(ramoId) {
  // order('id'): conserva el orden real de la pantalla "Tipo de Riesgo" del sistema de
  // escritorio (orden de inserción de la migración 012), no alfabético.
  const { data, error } = await supabase
    .from('rubros_actividad')
    .select('*, rubro_actividad_ramo!inner(ramo_id)')
    .eq('rubro_actividad_ramo.ramo_id', ramoId)
    .order('id')
  if (error) throw error
  // El embed no es parte del contrato público del endpoint (misma forma que antes
  // de este cambio) — se descarta acá, no en el controller/service.
  return data.map(({ rubro_actividad_ramo: _pertenencia, ...rubro }) => rubro)
}

/**
 * UPDATE directo de rubros_actividad — a diferencia de tasas_cobertura_ramo,
 * esta tabla no tiene vigente_desde ni versionado por INSERT (no hay historial
 * que preservar), así que se edita en el lugar.
 */
export async function actualizarRubroActividad(id, cambios) {
  const { data, error } = await supabase
    .from('rubros_actividad')
    .update(cambios)
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) throw error
  return data
}

export async function findRubroPorNombre(nombre) {
  const { data, error } = await supabase
    .from('rubros_actividad')
    .select('*')
    .eq('nombre', nombre)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function findCoberturasCatalogoByRamoId(ramoId) {
  const { data, error } = await supabase
    .from('coberturas_catalogo')
    .select('*')
    .eq('ramo_id', ramoId)
    .eq('activo', true)
  if (error) throw error
  return data
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
  const hoy = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('tasas_cobertura_ramo')
    .select('tasa_valor, unidad, vigente_desde, coberturas_catalogo(codigo)')
    .eq('ramo_id', ramoId)
    .lte('vigente_desde', hoy)
    .order('vigente_desde', { ascending: false })
  if (error) throw error

  const vigentesPorCodigo = new Map()
  for (const fila of data) {
    const codigo = fila.coberturas_catalogo?.codigo
    if (codigo && !vigentesPorCodigo.has(codigo)) {
      vigentesPorCodigo.set(codigo, fila)
    }
  }
  return [...vigentesPorCodigo.values()]
}

/**
 * Cabecera (`tipos_riesgo_incendio`) + detalle (`tasas_riesgo_objeto`) para la mecánica
 * `objeto_riesgo` de Incendio (planes Hipotecario, con/sin Inspección — migración 036). Un
 * override por `plan_id` tiene precedencia sobre la fila genérica (`plan_id IS NULL`) del mismo
 * objeto de riesgo — ver `ux_tasas_riesgo_objeto_generica`/`ux_tasas_riesgo_objeto_plan` en
 * design.md. Devuelve `null` si el tipo de riesgo no existe (o no está activo) o si no tiene
 * ninguna fila de tasa confirmada — el calculador (incendio.calculator.js) es quien traduce ese
 * `null` en el 422 de "Tipo de Riesgo no encontrado o sin tasas confirmadas".
 *
 * @param {number} ramoId
 * @param {string} tipoRiesgoNombre - ej. 'VIVIENDA FAMILIAR' (viaja en riesgo_datos.rubro_actividad,
 *   mismo campo reusado por la mecánica edificio_contenido para el rubro de rubros_actividad).
 * @param {number} planId
 * @returns {Promise<{tipo_riesgo:{nombre:string,tasa_global:number,tasa_minima:number|null,
 *   tasa_maxima:number|null,unidad:string}, objetos:Object<string,{tasa_valor:number,unidad:string}>}|null>}
 */
export async function findTasasRiesgoObjeto(ramoId, tipoRiesgoNombre, planId) {
  const { data: tipoRiesgo, error: errorTipoRiesgo } = await supabase
    .from('tipos_riesgo_incendio')
    .select('*')
    .eq('ramo_id', ramoId)
    .eq('nombre', tipoRiesgoNombre)
    .eq('activo', true)
    .maybeSingle()
  if (errorTipoRiesgo) throw errorTipoRiesgo
  if (!tipoRiesgo) return null

  const { data: tasas, error: errorTasas } = await supabase
    .from('tasas_riesgo_objeto')
    .select('*')
    .eq('tipo_riesgo_id', tipoRiesgo.id)
    .eq('activo', true)
    .or(`plan_id.is.null,plan_id.eq.${planId}`)
  if (errorTasas) throw errorTasas
  if (!tasas?.length) return null

  // Resolución override-primero: si ya hay una fila genérica (plan_id NULL) cargada para ese
  // objeto y llega una fila específica de ESTE plan, la específica gana — sin importar el orden
  // en que Supabase devolvió las filas.
  const filaPorObjeto = new Map()
  for (const fila of tasas) {
    const existente = filaPorObjeto.get(fila.objeto_riesgo)
    if (!existente || (existente.plan_id == null && fila.plan_id != null)) {
      filaPorObjeto.set(fila.objeto_riesgo, fila)
    }
  }

  const objetos = {}
  for (const [objeto, fila] of filaPorObjeto) {
    objetos[objeto] = { tasa_valor: fila.tasa_valor, unidad: fila.unidad }
  }

  return {
    tipo_riesgo: {
      nombre: tipoRiesgo.nombre,
      tasa_global: tipoRiesgo.tasa_global,
      tasa_minima: tipoRiesgo.tasa_minima,
      tasa_maxima: tipoRiesgo.tasa_maxima,
      unidad: tipoRiesgo.unidad,
    },
    objetos,
  }
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
    .eq('plan_id', planId)
  if (error) throw error
  return data.map((row) => row.variables)
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
    .order('id')
  if (error) throw error
  return data
}

export async function crearPlanCobertura(
  planId,
  { cobertura_id, incluida_por_defecto, monto, franquicia }
) {
  const { data, error } = await supabase
    .from('plan_coberturas')
    .insert({ plan_id: planId, cobertura_id, incluida_por_defecto, monto, franquicia })
    .select('*, coberturas_catalogo(*)')
    .single()
  if (error) throw error
  return data
}

export async function actualizarPlanCobertura(id, cambios) {
  const { data, error } = await supabase
    .from('plan_coberturas')
    .update(cambios)
    .eq('id', id)
    .select('*, coberturas_catalogo(*)')
    .maybeSingle()
  if (error) throw error
  return data
}

export async function eliminarPlanCobertura(id) {
  const { error } = await supabase.from('plan_coberturas').delete().eq('id', id)
  if (error) throw error
}

/**
 * Historial COMPLETO de tasas_cobertura_ramo de un ramo (todas las versiones por
 * vigente_desde, no solo la vigente) — a diferencia de findTasasCoberturaRamo, que
 * usan los calculadores en tiempo de cotización y trae todas las filas sin filtrar
 * por fecha (ver nota de bug en services/admin/tasas-cobertura.service.js).
 */
export async function findTasasCoberturaRamoConHistorial(ramoId) {
  const { data, error } = await supabase
    .from('tasas_cobertura_ramo')
    .select('*, coberturas_catalogo(id, codigo, nombre)')
    .eq('ramo_id', ramoId)
    .order('vigente_desde', { ascending: false })
  if (error) throw error
  return data
}

// Borra una versión puntual (ej. tasa cargada por error). No es un UPDATE de la fila —
// la regla de "nunca UPDATE" es sobre el VALOR de una versión ya vigente; borrar una
// versión mal cargada (típicamente la más reciente, antes de que se haya usado para
// cotizar) simplemente hace que vuelva a regir la versión anterior.
export async function eliminarTasaCoberturaRamo(id) {
  const { error } = await supabase.from('tasas_cobertura_ramo').delete().eq('id', id)
  if (error) throw error
}

// Inserta una versión NUEVA — nunca UPDATE. Ver decisión de "versionado por
// inserción" en docs/PLAN_ADMIN_FASE5.md.
export async function crearTasaCoberturaRamo(
  ramoId,
  { cobertura_id, tasa_valor, unidad, vigente_desde }
) {
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
    .single()
  if (error) throw error
  return data
}
