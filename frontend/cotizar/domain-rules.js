import { state } from './state.js'
import {
  PLANES_VIDA_AP_CALCULABLES,
  FRANQUICIA_OPCIONES,
  OBJETOS_RIESGO_CAMPOS,
  RAMOS_CON_AJUSTES,
  PORCENTAJE_VENTANILLA_SOBRE_CAJA_FUERTE,
  CODIGOS_COBERTURA_EXCLUIDOS_BASE,
  RAMOS_CON_CALCULO,
  ORDEN_FORMAS_PAGO,
  LIMITE_REPETICION_COBERTURA_MRC,
  LIMITE_REPETICION_COBERTURA_MRC_DEFAULT,
} from './constants.js'

// Criterio de "plan calculable" (RPF/tasas confirmados) según el ramo — MRC e Incendio usan
// prima_tecnica_minima; Vida-AP no maneja ese piso (decisión de Kevin) y usa la lista fija de
// planes con calculador implementado.
export function planEsCalculable(ramoNombre, plan) {
  if (!plan) return false
  if (ramoNombre === 'vida-ap') return PLANES_VIDA_AP_CALCULABLES.includes(plan.nombre)
  return plan.prima_tecnica_minima != null
}

export function franquiciaValorPorDefecto(franquiciaDefaultMonto) {
  if (!franquiciaDefaultMonto) return 'sin_deducible'
  const match = FRANQUICIA_OPCIONES.find((o) => o.monto === franquiciaDefaultMonto)
  return match ? match.valor : 'sin_deducible'
}

// Traduce el mapa de selección en UI (codigo -> valor de FRANQUICIA_OPCIONES) al mapa
// codigo -> monto que espera el backend (riesgo_datos.franquicias_por_cobertura).
export function franquiciasPorCoberturaParaBody() {
  const resultado = {}
  for (const [codigo, valor] of Object.entries(state.franquiciasPorCobertura)) {
    const opcion = FRANQUICIA_OPCIONES.find((o) => o.valor === valor)
    resultado[codigo] = opcion ? opcion.monto : null
  }
  return resultado
}

// Moneda efectiva de la cotización según el plan elegido — MAQUINARIA BASICO queda fijo en USD
// (cierra el gap de formato de la migración 013, ver spec cotizacion-moneda#Legacy USD-only
// plan), los 3 planes nuevos de mecánica `objeto_riesgo` permiten elegir Gs./USD (selector, ver
// renderMonedaSelector), y el resto de los planes/ramos (MRC, Edificio y Contenido, Vida-AP)
// sigue fijo en Gs. — no se ofrece selector ahí en esta pasada.
export function monedaEfectiva(plan) {
  if (plan?.nombre === 'MAQUINARIA BASICO') return 'USD'
  if (plan?.tipo_mecanica === 'objeto_riesgo') return state.data.moneda || 'PYG'
  return 'PYG'
}

// Plan actualmente elegido — helper repetido en varios puntos de render (panel en vivo,
// resultado, resumen) que hoy resuelven `state.planes.find(...)` a mano; se centraliza acá para
// que `monedaCotizacionActual()` (usada por los displays de montos) no duplique la búsqueda.
export function planActual() {
  return state.planes.find((p) => p.id === state.planId)
}

// Moneda del plan actualmente elegido — ver monedaEfectiva(). Los displays de montos ya
// calculados (panel en vivo, resumen de la cotización, coberturas) usan esta función en vez de
// asumir Gs. siempre, para no repetir el gap de formato de la migración 013 (Maquinaria Básico
// mostrado con fmtGs pese a cotizar en USD — ver cotizacion-moneda#Legacy USD-only plan).
export function monedaCotizacionActual() {
  return monedaEfectiva(planActual())
}

// Suma de los 4 objetos de riesgo declarados (mecánica `objeto_riesgo`) — usada tanto para
// `capital_asegurado` como para la sugerencia no bloqueante de con/sin Inspección.
export function sumaObjetoRiesgo() {
  return OBJETOS_RIESGO_CAMPOS.reduce(
    (acc, { stateKey }) => acc + (Number(state.data[stateKey]) || 0),
    0
  )
}

// Sugerencia de plan con/sin Inspección según la suma declarada — puramente informativa para
// el agente. La validación real (bloqueante, 422) la hace el backend (ver
// incendio-umbral-inspeccion#Threshold validated on the backend, source of truth); acá solo se
// avisa cuando el plan elegido probablemente no sea el correcto para esa suma, sin bloquear nada.
// Devuelve `null` si no aplica (Hipotecario, umbral todavía no confirmado, sin datos declarados,
// o si el umbral está en una moneda distinta a la cotización — no se convierte en el frontend).
export function sugerenciaInspeccion(plan) {
  if (!plan || plan.tipo_mecanica !== 'objeto_riesgo' || plan.requiere_inspeccion == null) {
    return null
  }
  if (plan.umbral_inspeccion_monto == null) return null

  const suma = sumaObjetoRiesgo()
  if (suma <= 0) return null

  const moneda = monedaEfectiva(plan)
  if (plan.umbral_inspeccion_moneda && plan.umbral_inspeccion_moneda !== moneda) return null

  const superaUmbral = suma >= plan.umbral_inspeccion_monto
  if (superaUmbral === plan.requiere_inspeccion) return null

  return superaUmbral
    ? 'La suma declarada alcanza o supera el umbral de inspección — este plan puede requerir "Incendio con Inspección" (el backend valida al guardar).'
    : 'La suma declarada está por debajo del umbral de inspección — podés cotizar bajo "Incendio sin Inspección" (el backend valida al guardar).'
}

// Traduce el descuento/recargo cargado en "Detalle del plan" (state.data.descuentoMonto /
// state.data.descuentoPorcentaje — dos campos fijos, uno en Gs. y otro en %, en vez de un input
// + selector) al array que espera el body de POST /cotizaciones/calcular y POST /cotizaciones
// (ver ajusteSchema en mrc.schema.js / incendio.schema.js: requiere `descripcion`, y monto O
// porcentaje). El tope real (plan.descuento_maximo / plan.recargo_maximo) lo aplica el backend
// (sumarAjustes) — acá solo se arma el ajuste crudo, sin clampear. Si el agente cargó los dos
// campos a la vez, se prioriza el monto en Gs. (caso borde, no bloqueamos con validación extra).
export function ajustesParaBody(prefijo, descripcion) {
  if (!RAMOS_CON_AJUSTES.includes(state.ramoId)) return []
  const monto = Number(state.data[`${prefijo}Monto`]) || 0
  if (monto > 0) return [{ descripcion, monto }]
  const porcentaje = Number(state.data[`${prefijo}Porcentaje`]) || 0
  if (porcentaje > 0) return [{ descripcion, porcentaje }]
  return []
}

export function descuentosParaBody() {
  return ajustesParaBody('descuento', 'Descuento aplicado por el agente')
}

export function recargosParaBody() {
  return ajustesParaBody('recargo', 'Recargo aplicado por el agente')
}

// Sublímite "Robo valores ventanilla" calculado en vivo — no vive en plan_coberturas (a
// diferencia de los sublímites fijos del plan) porque depende de un monto que el agente recién
// carga en esta cotización, no de un default del plan. Devuelve null si todavía no se cargó
// "Valores en caja fuerte" (no hay nada que auto-vincular).
export function sublimiteVentanillaCalculado() {
  const capitalCajaFuerte = state.coberturasAdicionales
    .filter((l) => l.codigo === 'robo_caja_registradora')
    .reduce((acc, l) => acc + (Number(l.sumaAsegurada) || 0), 0)
  if (capitalCajaFuerte <= 0) return null
  const catalogo = state.coberturasCatalogo.find((c) => c.codigo === 'robo_valores_ventanilla')
  return {
    codigo: 'robo_valores_ventanilla',
    nombre: catalogo?.nombre ?? 'Robo valores ventanilla',
    monto: Math.round(capitalCajaFuerte * PORCENTAJE_VENTANILLA_SOBRE_CAJA_FUERTE),
  }
}

// Sublímites de MRC fijos por defecto — leídos de `plan_coberturas.incluida_por_defecto` del
// plan elegido (WU6, 2026-07-17), en vez de la vieja constante hardcodeada SUBLIMITES_FIJOS_MRC.
// El agente no los elige ni les cambia el monto, así que se muestran aparte en el panel
// "Sublímites" (ver renderSublimitesFijosMrc), no como fila editable/quitable en "Coberturas
// adicionales". Excluye explícitamente Incendio Edificio/Contenido: esas 2 no viven en
// `plan_coberturas` (se cotizan por Capital Edificio/Contenido, campo propio del formulario),
// pero se filtran igual por defensividad ante un dato inesperado.
export function sublimitesFijosMrc() {
  const fijosDelPlan = state.planCoberturas
    .filter(
      (pc) =>
        pc.incluida_por_defecto &&
        !CODIGOS_COBERTURA_EXCLUIDOS_BASE.includes(pc.coberturas_catalogo?.codigo)
    )
    .map((pc) => ({
      codigo: pc.coberturas_catalogo?.codigo,
      nombre: pc.coberturas_catalogo?.nombre ?? pc.coberturas_catalogo?.codigo,
      monto: pc.monto,
    }))
    .filter((s) => s.codigo)
  const ventanilla = sublimiteVentanillaCalculado()
  return ventanilla ? [...fijosDelPlan, ventanilla] : fijosDelPlan
}

export function datosMinimosCompletos() {
  if (!RAMOS_CON_CALCULO.includes(state.ramoId) || !state.planId) return false
  const plan = state.planes.find((p) => p.id === state.planId)
  if (!planEsCalculable(state.ramoId, plan)) return false
  const d = state.data

  if (state.ramoId === 'mrc') {
    const capitalEdificio = Number(d.capitalEdificio) || 0
    const capitalContenido = Number(d.capitalContenido) || 0
    return (
      Boolean(d.rubroActividad) &&
      Boolean(d.ciudad) &&
      (capitalEdificio > 0 || capitalContenido > 0)
    )
  }

  if (state.ramoId === 'incendio') {
    if (plan.nombre === 'MAQUINARIA BASICO') {
      return (Number(d.capitalMaquinaria) || 0) > 0
    }
    if (plan.tipo_mecanica === 'objeto_riesgo') {
      return Boolean(d.rubroActividad) && sumaObjetoRiesgo() > 0
    }
    const capitalEdificio = Number(d.capitalEdificio) || 0
    const capitalContenido = Number(d.capitalContenido) || 0
    return (
      Boolean(d.rubroActividad) &&
      Boolean(d.ciudad) &&
      (capitalEdificio > 0 || capitalContenido > 0)
    )
  }

  if (state.ramoId === 'vida-ap') {
    const capitalAsegurado = Number(d.capitalAsegurado) || 0
    if (plan.nombre === 'PROTECCION FAMILIAR') return capitalAsegurado > 0
    return capitalAsegurado > 0 && Boolean(d.edad)
  }

  return false
}

// `capital_asegurado` es una columna propia de `cotizaciones` (no del cálculo de prima en sí,
// cada calculador usa sus propios campos de riesgo_datos) — se manda siempre en el body porque
// el schema de validación de cada ramo lo exige (ver schemas/mrc|incendio|vida-ap.schema.js).
export function capitalAseguradoParaBody(plan) {
  const d = state.data

  if (state.ramoId === 'mrc') {
    return (Number(d.capitalEdificio) || 0) + (Number(d.capitalContenido) || 0)
  }

  if (state.ramoId === 'incendio') {
    if (plan?.nombre === 'MAQUINARIA BASICO') return Number(d.capitalMaquinaria) || 0
    if (plan?.tipo_mecanica === 'objeto_riesgo') return sumaObjetoRiesgo()
    return (Number(d.capitalEdificio) || 0) + (Number(d.capitalContenido) || 0)
  }

  if (state.ramoId === 'vida-ap') {
    return Number(d.capitalAsegurado) || 0
  }

  return 0
}

// ---------------------------------------------------------------------------
// Forma de pago: las 4 (Contado, Crédito/Cobrador, Boca de Cobranza, Tarjeta de Crédito)
// siempre se calculan en simultáneo (ver PLAN_DESARROLLO.md sección 5) — acá el agente
// elige UNA para presentarle al cliente en el cotizador. Esa elección se conserva en
// state.formaPagoCodigo y es la que se vuelve a mostrar en "Detalle del plan" y, más
// adelante, en la Carta Oferta.
// ---------------------------------------------------------------------------

export function formasPagoDisponibles() {
  const formas = state.preview?.variantes?.[0]?.formasPago ?? []
  return [...formas].sort(
    (a, b) => ORDEN_FORMAS_PAGO.indexOf(a.codigo) - ORDEN_FORMAS_PAGO.indexOf(b.codigo)
  )
}

export function formaPagoSeleccionada() {
  const formas = formasPagoDisponibles()
  if (!formas.length) return null
  return formas.find((fp) => fp.codigo === state.formaPagoCodigo) || formas[0]
}

// El agente no puede pasar a "Detalle del plan" mientras haya una alerta bloqueante
// (prima por debajo de la Prima Técnica Mínima, o capital por encima de la Responsabilidad
// Máxima Cotizable) — ver mrc.calculator.js. Otros ramos (sin calculador conectado todavía)
// no tienen esta restricción.
export function puedeAvanzarADetalle() {
  if (!RAMOS_CON_CALCULO.includes(state.ramoId)) return true
  return Boolean(state.preview) && !state.previewError
}

// Suma de las líneas de "Coberturas incluidas" que cuentan como suma asegurada propia
// (Incendio Edificio/Contenido + coberturas adicionales que agregó el agente) — igual que
// "Suma total Gs." en el Excel del cliente (Version 01 - Calculo Varios.xlsx). Los
// sub-límites nunca suman al total (a pedido de Kevin, 2026-07-15), ni "Robo valores
// ventanilla" (sub-límite de "Valores en caja fuerte", marcado con
// incluye_en_suma_asegurada_total = false en la migración 020). Extraída de
// renderResumenCotizacion (WU7, Ajuste MC.xlsx ítem #7, 2026-08-05) para reutilizarla también
// en el panel "Cotización en vivo" (renderLivePanelBody), donde el agente quiere ver la tasa
// efectiva (costo/capital) sin tener que llegar a "Detalle del plan".
export function capitalTotalAsegurado() {
  return (state.preview?.coberturas || []).reduce((acc, c) => {
    const esSublimite = c.tipo_aplicacion === 'sublimite'
    const cuentaParaTotal = !esSublimite && c.incluye_en_suma_asegurada_total !== false
    return acc + (cuentaParaTotal ? Number(c.monto) || 0 : 0)
  }, 0)
}

// Opciones seleccionables en "Coberturas adicionales": el catálogo del ramo sin las 2 fijas
// (tienen su propio campo), sin sublimite_cctv (sin tasa cargada todavía — no cotizable), y sin
// los sublímites fijos por defecto del plan actual (ver sublimitesFijosMrc()).
export function coberturasDisponibles() {
  const excluidos = [
    ...CODIGOS_COBERTURA_EXCLUIDOS_BASE,
    ...sublimitesFijosMrc().map((s) => s.codigo),
  ]
  return state.coberturasCatalogo.filter((c) => !excluidos.includes(c.codigo))
}

// true si todavía queda lugar para otra línea de cobertura adicional — usado para deshabilitar
// tanto el "+ Agregar cobertura" del selector libre (Datos) como el "Agregar cobertura
// adicional" de "Detalle del plan" una vez alcanzada la capacidad máxima. La capacidad total es
// la suma de los límites de repetición de todo `catalogoDisponible` (ver
// LIMITE_REPETICION_COBERTURA_MRC) — se compara contra el total de líneas ya creadas, no solo
// contra las que ya tienen un código elegido, porque una fila vacía ("Seleccioná una
// cobertura...") también ocupa un lugar y sin este chequeo el botón se podía seguir clickeando
// para crear filas vacías sin límite.
export function quedanCoberturasAdicionalesPorAgregar(catalogoDisponible) {
  const capacidadTotal = catalogoDisponible.reduce((acc, c) => {
    const limite =
      LIMITE_REPETICION_COBERTURA_MRC[c.codigo] ?? LIMITE_REPETICION_COBERTURA_MRC_DEFAULT
    return acc + limite
  }, 0)
  return state.coberturasAdicionales.length < capacidadTotal
}
