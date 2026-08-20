export const FRANQUICIA_MRC_RESTRINGIDA_MONTO = 500000

const CODIGOS_COBERTURA_FIJOS_MRC = ['incendio_edificio', 'incendio_contenido']
export const CODIGOS_FRANQUICIA_MRC_OBLIGATORIA = [
  'robo_valores_ventanilla',
  'sublimite_equipos_electronicos',
]

export function puedeSeleccionarFranquicia(usuario) {
  return usuario?.rol === 'admin' || usuario?.puede_seleccionar_franquicia === true
}

// La lista se deriva exclusivamente del riesgo validado: evita guardar selecciones para códigos
// que no participan de esta cotización y asegura que el riesgo JSON coincida con el snapshot.
export function normalizarFranquiciasMrc(datosValidados, usuario) {
  const riesgoDatos = datosValidados.riesgo_datos
  const codigosAplicables = new Set([
    ...CODIGOS_COBERTURA_FIJOS_MRC,
    ...(riesgoDatos.coberturas_adicionales ?? []).map((cobertura) => cobertura.codigo),
  ])
  const franquiciasSolicitadas = riesgoDatos.franquicias_por_cobertura ?? {}
  const autorizado = puedeSeleccionarFranquicia(usuario)
  const franquiciasPorCobertura = autorizado
    ? Object.fromEntries(
        [...codigosAplicables].map((codigo) => [
          codigo,
          CODIGOS_FRANQUICIA_MRC_OBLIGATORIA.includes(codigo)
            ? FRANQUICIA_MRC_RESTRINGIDA_MONTO
            : (franquiciasSolicitadas[codigo] ?? null),
        ])
      )
    : Object.fromEntries(
        [...codigosAplicables]
          .filter((codigo) => CODIGOS_FRANQUICIA_MRC_OBLIGATORIA.includes(codigo))
          .map((codigo) => [codigo, FRANQUICIA_MRC_RESTRINGIDA_MONTO])
      )

  return {
    ...datosValidados,
    riesgo_datos: {
      ...riesgoDatos,
      franquicias_por_cobertura: franquiciasPorCobertura,
    },
  }
}
