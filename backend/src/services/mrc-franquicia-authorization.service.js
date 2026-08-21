import { httpError } from '../utils/http-error.js'

const CODIGO_COBERTURA_INDEPENDIENTE_NO_SOLICITABLE_MRC = 'equipos_electronicos'
const CODIGOS_FRANQUICIA_NULA_MRC = new Set(['incendio_edificio', 'incendio_contenido'])
const CODIGOS_FRANQUICIA_OCULTA_MRC = new Set([
  'sublimite_danos_agua',
  'sublimite_granizo',
  'robo_valores_ventanilla',
  'sublimite_equipos_electronicos',
])
const MONTOS_FRANQUICIA_MRC_SOPORTADOS = new Set([
  500_000, 800_000, 1_000_000, 1_200_000, 1_500_000,
])

export function puedeSeleccionarFranquicia(usuario) {
  return usuario?.rol === 'admin' || usuario?.puede_seleccionar_franquicia === true
}

function errorConfiguracion(codigo) {
  return httpError(
    422,
    `Falta una configuración de franquicia MRC válida para la cobertura "${codigo}" en el plan seleccionado.`,
    'El plan seleccionado tiene una configuración de franquicia incompleta.'
  )
}

function configuracionPorCodigo(planCoberturas) {
  return new Map(
    (planCoberturas ?? [])
      .filter((fila) => fila.coberturas_catalogo?.codigo)
      .map((fila) => [fila.coberturas_catalogo.codigo, fila.franquicia])
  )
}

function validarDefaultConfigurado(codigo, franquicia) {
  if (franquicia == null || (Number.isFinite(franquicia) && franquicia > 0)) return
  throw errorConfiguracion(codigo)
}

function validarSeleccion(codigo, franquicia, porDefecto) {
  const permiteNula = CODIGOS_FRANQUICIA_NULA_MRC.has(codigo)
  if (
    (franquicia == null && permiteNula) ||
    MONTOS_FRANQUICIA_MRC_SOPORTADOS.has(franquicia) ||
    franquicia === porDefecto
  )
    return
  throw httpError(
    422,
    `La franquicia seleccionada para "${codigo}" no está soportada.`,
    'La franquicia seleccionada no es válida para esa cobertura.'
  )
}

export function normalizarFranquiciasMrc(datosValidados, usuario, planCoberturas) {
  const riesgoDatos = datosValidados.riesgo_datos
  const coberturasAdicionales = riesgoDatos.coberturas_adicionales ?? []
  if (
    coberturasAdicionales.some(
      (cobertura) => cobertura.codigo === CODIGO_COBERTURA_INDEPENDIENTE_NO_SOLICITABLE_MRC
    )
  ) {
    throw httpError(
      422,
      'La cobertura adicional "equipos_electronicos" no es solicitable en MRC; se representa únicamente mediante "sublimite_equipos_electronicos".',
      'Equipos Electrónicos no puede solicitarse como cobertura adicional independiente en MRC.'
    )
  }
  const codigosAplicables = new Set([
    'incendio_edificio',
    'incendio_contenido',
    ...coberturasAdicionales.map((cobertura) => cobertura.codigo),
  ])
  const defaults = configuracionPorCodigo(planCoberturas)
  const solicitadas = riesgoDatos.franquicias_por_cobertura ?? {}
  const autorizado = puedeSeleccionarFranquicia(usuario)
  const franquiciasPorCobertura = {}

  for (const codigo of codigosAplicables) {
    if (!defaults.has(codigo)) throw errorConfiguracion(codigo)
    const porDefecto = defaults.get(codigo)
    validarDefaultConfigurado(codigo, porDefecto)

    const puedeElegir = autorizado && !CODIGOS_FRANQUICIA_OCULTA_MRC.has(codigo)
    const franquicia =
      puedeElegir && Object.hasOwn(solicitadas, codigo) ? solicitadas[codigo] : porDefecto
    if (puedeElegir) validarSeleccion(codigo, franquicia, porDefecto)
    franquiciasPorCobertura[codigo] = franquicia
  }

  return {
    ...datosValidados,
    riesgo_datos: {
      ...riesgoDatos,
      franquicias_por_cobertura: franquiciasPorCobertura,
    },
  }
}
