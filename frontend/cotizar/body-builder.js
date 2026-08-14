import { state } from './state.js'
import {
  CODIGOS_COBERTURA_EXCLUIDOS_BASE,
  OBJETOS_RIESGO_CAMPOS,
  RAMOS_CON_AJUSTES,
} from './constants.js'
import {
  franquiciaValorPorDefecto,
  franquiciasPorCoberturaParaBody,
  sublimitesFijosMrc,
} from './domain-rules.js'

// Traduce `cotizacion.riesgo_datos` (shape guardado por cada calculador — ver
// armarRiesgoDatos()) de vuelta a los campos de state.data que usa el formulario.
export function prefillDatosDesdeCotizacion(ramoNombre, plan, cotizacion) {
  const rd = cotizacion.riesgo_datos || {}
  state.data.clienteNombre = cotizacion.cliente_nombre || ''
  // `moneda` es una columna de cabecera de `cotizaciones` (no vive en `riesgo_datos`) — se
  // restaura acá para cualquier ramo, aunque hoy solo Incendio (Maquinaria/objeto_riesgo) la usa
  // para algo distinto de PYG por defecto (ver monedaEfectiva()).
  state.data.moneda = cotizacion.moneda || 'PYG'

  if (ramoNombre === 'mrc') {
    state.data.cedula = rd.cedula || ''
    state.data.direccion = rd.direccion || ''
    state.data.rubroActividad = rd.rubro_actividad || ''
    state.data.ciudad = rd.ciudad || ''
    state.data.capitalEdificio = rd.capital_edificio || ''
    state.data.capitalContenido = rd.capital_contenido || ''

    // Los sublímites fijos del plan y el de Ventanilla (ver sublimitesFijosMrc()) ya se
    // re-agregan solos en armarRiesgoDatos() — no deben duplicarse acá como línea editable de
    // "Coberturas adicionales". sublimitesFijosMrc() todavía no puede calcular Ventanilla acá
    // (depende de state.coberturasAdicionales, que recién se llena en esta misma asignación) —
    // se usa CODIGOS_COBERTURA_EXCLUIDOS_BASE para cubrir ese caso sin depender del orden. Las
    // Coberturas Principales "Por defecto" (ver coberturasPrincipalesFijasMrc()) NO se excluyen
    // acá a propósito: no tienen monto fijo, así que la cotización guardada ya trae la suma
    // asegurada real que cargó el agente — se restaura como cualquier otra línea normal.
    const codigosFijos = new Set([
      ...CODIGOS_COBERTURA_EXCLUIDOS_BASE,
      ...sublimitesFijosMrc().map((s) => s.codigo),
    ])
    state.coberturasAdicionales = (rd.coberturas_adicionales || [])
      .filter((c) => c.codigo && !codigosFijos.has(c.codigo))
      .map((c) => ({ id: idLinea(), codigo: c.codigo, sumaAsegurada: c.suma_asegurada }))
    // Prefill viene de una cotización ya guardada: todas las líneas traen su monto real, así
    // que arrancan cerradas (coberturas-adicionales-redesign, D4) — sin esto, ids de una pasada
    // de edición anterior podrían quedar abiertos si alguna vez se reusaran (hoy no pasa, los
    // ids son UUID por línea, pero el Set debe arrancar limpio en cada carga para editar).
    state.coberturasAdicionalesEditando.clear()

    // Reasignación completa (no aditiva) — si no se limpia acá, una franquicia elegida en una
    // cotización cargada previamente queda "fantasma" al cargar otra sin recargar la página
    // (issue #285, hallado como candidato CARACTERIZACIÓN #8 en cotizacion-modularizacion).
    state.franquiciasPorCobertura = {}
    for (const [codigo, monto] of Object.entries(rd.franquicias_por_cobertura || {})) {
      state.franquiciasPorCobertura[codigo] = franquiciaValorPorDefecto(monto)
    }
  } else if (ramoNombre === 'incendio') {
    if (plan?.nombre === 'MAQUINARIA BASICO') {
      state.data.capitalMaquinaria = rd.capital_maquinaria || ''
      if (rd.sublimite_vandalismo_porcentaje != null) {
        state.data.sublimiteVandalismoPorcentaje = rd.sublimite_vandalismo_porcentaje
      }
    } else if (plan?.tipo_mecanica === 'objeto_riesgo') {
      state.data.rubroActividad = rd.rubro_actividad || ''
      for (const { stateKey, riesgoKey } of OBJETOS_RIESGO_CAMPOS) {
        state.data[stateKey] = rd[riesgoKey] || ''
      }
    } else {
      state.data.rubroActividad = rd.rubro_actividad || ''
      state.data.capitalEdificio = rd.capital_edificio || ''
      state.data.capitalContenido = rd.capital_contenido || ''
      if (rd.sublimite_fenomenos_naturales_porcentaje != null) {
        state.data.sublimiteFenomenosNaturalesPorcentaje =
          rd.sublimite_fenomenos_naturales_porcentaje
      }
    }
  } else if (ramoNombre === 'vida-ap') {
    state.data.capitalAsegurado = rd.capital_asegurado || ''
    if (rd.edad != null) state.data.edad = rd.edad
    if (rd.incluye_renta_diaria) {
      state.data.incluyeRentaDiaria = true
      state.data.sumaRentaDiaria = rd.suma_renta_diaria || ''
    }
  }

  // Descuento/recargo manual — se prefillea con el monto YA topado que quedó guardado
  // (cotizacion_ajustes), no con el % crudo que haya tipeado el agente en su momento (ese dato
  // no se persiste por separado, ver comentario de insertAjustes en cotizaciones.repository.js).
  if (RAMOS_CON_AJUSTES.includes(ramoNombre)) {
    const variante = cotizacion.cotizacion_variantes?.[0]
    const ajustes = variante?.cotizacion_ajustes || []
    const descuento = ajustes.find((a) => a.tipo === 'descuento')
    const recargo = ajustes.find((a) => a.tipo === 'recargo')
    if (descuento) state.data.descuentoMonto = descuento.monto
    if (recargo) state.data.recargoMonto = recargo.monto
  }

  const cuotas = cotizacion.cotizacion_variantes?.[0]?.cotizacion_plan_pago?.[0]?.cantidad_cuotas
  if (cuotas != null) state.data.cuotas = cuotas
}

// crypto.randomUUID() exige contexto seguro (HTTPS o localhost) — cae acá
// si se accede por HTTP a una IP directa. Solo hace falta un id único de fila.
export function idLinea() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `linea-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function armarRiesgoDatosMrc(plan) {
  const d = state.data
  return {
    cedula: d.cedula || '',
    direccion: d.direccion || '',
    rubro_actividad: d.rubroActividad || '',
    ciudad: d.ciudad || '',
    capital_edificio: Number(d.capitalEdificio) || 0,
    capital_contenido: Number(d.capitalContenido) || 0,
    coberturas_adicionales: [
      ...sublimitesFijosMrc().map((s) => ({ codigo: s.codigo, suma_asegurada: s.monto })),
      ...state.coberturasAdicionales
        .filter((l) => l.codigo && Number(l.sumaAsegurada) > 0)
        .map((l) => ({ codigo: l.codigo, suma_asegurada: Number(l.sumaAsegurada) })),
    ],
    franquicias_por_cobertura: franquiciasPorCoberturaParaBody(),
  }
}

function armarRiesgoDatosIncendio(plan) {
  const d = state.data
  if (plan.nombre === 'MAQUINARIA BASICO') {
    return {
      capital_maquinaria: Number(d.capitalMaquinaria) || 0,
      ...(d.sublimiteVandalismoPorcentaje !== undefined && d.sublimiteVandalismoPorcentaje !== ''
        ? { sublimite_vandalismo_porcentaje: Number(d.sublimiteVandalismoPorcentaje) }
        : {}),
    }
  }
  if (plan.tipo_mecanica === 'objeto_riesgo') {
    // Los 4 objetos de riesgo son opcionales (ver incendio-planes-objeto-riesgo#Optional risk
    // objects) — se manda el número declarado (0 si no se cargó), el backend solo suma los
    // que tengan capital > 0 (ver calcularPorObjetoRiesgo en incendio.calculator.js).
    const objetosDeclarados = {}
    for (const { stateKey, riesgoKey } of OBJETOS_RIESGO_CAMPOS) {
      objetosDeclarados[riesgoKey] = Number(d[stateKey]) || 0
    }
    return {
      rubro_actividad: d.rubroActividad || '',
      ...objetosDeclarados,
    }
  }
  return {
    rubro_actividad: d.rubroActividad || '',
    capital_edificio: Number(d.capitalEdificio) || 0,
    capital_contenido: Number(d.capitalContenido) || 0,
    ...(d.sublimiteFenomenosNaturalesPorcentaje !== undefined &&
    d.sublimiteFenomenosNaturalesPorcentaje !== ''
      ? {
          sublimite_fenomenos_naturales_porcentaje: Number(d.sublimiteFenomenosNaturalesPorcentaje),
        }
      : {}),
  }
}

function armarRiesgoDatosVidaAp(plan) {
  const d = state.data
  const base = { capital_asegurado: Number(d.capitalAsegurado) || 0 }
  if (plan.nombre === 'PROTECCION FAMILIAR') return base

  base.edad = Number(d.edad) || null
  if (
    plan.nombre === 'ACCIDENTES PERSONALES - SECTOR COOPERATIVO' ||
    plan.nombre === 'ACCIDENTES PERSONALES - SECTOR PRIVADO'
  ) {
    if (d.incluyeRentaDiaria) {
      base.incluye_renta_diaria = true
      base.suma_renta_diaria = Number(d.sumaRentaDiaria) || 0
    }
  }
  return base
}

// switch en vez de un dispatch table por objeto: CodeQL (js/unvalidated-dynamic-method-call)
// marca cualquier invocación dinámica `obj[key]()` con key derivada de state.ramoId, sin
// reconocer Object.create(null)/hasOwnProperty/typeof como saneamiento. Un switch con case
// literales llama directo a la función nombrada, sin invocación dinámica por clave.
// Arma el `riesgo_datos` esperado por el calculador del ramo/plan actual (ver
// incendio.calculator.js / vida-ap.calculator.js para el shape exacto).
export function armarRiesgoDatos(plan) {
  switch (state.ramoId) {
    case 'mrc':
      return armarRiesgoDatosMrc(plan)
    case 'incendio':
      return armarRiesgoDatosIncendio(plan)
    case 'vida-ap':
      return armarRiesgoDatosVidaAp(plan)
    default:
      return {}
  }
}
