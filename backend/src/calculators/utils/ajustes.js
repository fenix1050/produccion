export function sumarAjustes(ajustes, base, tope) {
  const total = ajustes.reduce((acc, ajuste) => {
    const monto = ajuste.monto ?? base * (ajuste.porcentaje / 100);
    return acc + monto;
  }, 0);

  if (tope != null) {
    const topeMonto = base * (tope / 100);
    return Math.min(total, topeMonto);
  }
  return total;
}

// Combina el tope del plan (planes.descuento_maximo/recargo_maximo) con el tope propio
// del usuario (usuarios.descuento_maximo_pct/recargo_maximo_pct, Fase 5). Gana el más
// restrictivo de los dos que estén cargados; si ninguno está cargado, no hay tope.
export function topeEfectivo(topePlan, topeUsuario) {
  if (topePlan == null) return topeUsuario ?? null;
  if (topeUsuario == null) return topePlan;
  return Math.min(topePlan, topeUsuario);
}
