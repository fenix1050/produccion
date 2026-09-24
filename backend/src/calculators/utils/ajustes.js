import { httpError } from '../../utils/http-error.js'

export function sumarAjustes(ajustes, base, tope) {
  const total = ajustes.reduce((acc, ajuste) => {
    const monto = ajuste.monto ?? base * (ajuste.porcentaje / 100)
    return acc + monto
  }, 0)

  if (tope != null) {
    const topeMonto = base * (tope / 100)
    return Math.min(total, topeMonto)
  }
  return total
}

// Valida cada ajuste manual contra el mismo porcentaje de prima que limita el total agregado.
// Los montos fijos se comparan como porcentaje equivalente de la prima base, sin un tope absoluto.
export function validarAjustesIndividuales(ajustes, base, tope, etiqueta) {
  for (const ajuste of ajustes) {
    const tieneMonto = ajuste.monto != null
    const tienePorcentaje = ajuste.porcentaje != null
    if (
      tieneMonto === tienePorcentaje ||
      (tieneMonto && ajuste.monto < 0) ||
      (tienePorcentaje && ajuste.porcentaje < 0)
    ) {
      throw httpError(
        422,
        'El ajuste debe indicar un único valor no negativo (monto o porcentaje).'
      )
    }

    if (tope == null) continue

    const excedeTope = tieneMonto ? ajuste.monto > base * (tope / 100) : ajuste.porcentaje > tope
    if (excedeTope) {
      throw httpError(422, `El ajuste excede el tope efectivo de ${etiqueta}.`)
    }
  }
}

// Combina el tope del plan (planes.descuento_maximo/recargo_maximo) con el tope propio
// del usuario (usuarios.descuento_maximo_pct/recargo_maximo_pct, Fase 5). Gana el más
// restrictivo de los dos que estén cargados; si ninguno está cargado, no hay tope.
export function topeEfectivo(topePlan, topeUsuario) {
  if (topePlan == null) return topeUsuario ?? null
  if (topeUsuario == null) return topePlan
  return Math.min(topePlan, topeUsuario)
}
