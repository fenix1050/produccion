// Logging de eventos de seguridad (A09 - OWASP Top 10: "Security Logging and
// Monitoring Failures"). Hoy no hay ningún sistema de log centralizado, así que este
// helper escribe a console.error/console.warn con formato consistente para que quede
// capturado por lo que sea que agregue el hosting (Railway/Render) más adelante.
//
// NUNCA se debe loguear un token, un password_hash ni una contraseña en texto plano —
// `sanitizarDetalle` filtra esos campos aunque vengan en el objeto `detalle`, así una
// instrumentación apurada no termina filtrando un secreto al log.
const CAMPOS_SENSIBLES = ['token', 'password', 'password_hash', 'passwordActual', 'passwordNueva', 'passwordHash'];

function sanitizarDetalle(detalle) {
  if (!detalle || typeof detalle !== 'object') return detalle;
  const limpio = {};
  for (const [clave, valor] of Object.entries(detalle)) {
    if (CAMPOS_SENSIBLES.some((campo) => clave.toLowerCase().includes(campo.toLowerCase()))) {
      limpio[clave] = '[REDACTED]';
      continue;
    }
    limpio[clave] = valor;
  }
  return limpio;
}

/**
 * @param {string} evento - identificador corto en snake_case, ej. 'login_fallido'
 * @param {object} [detalle] - contexto adicional (nunca tokens/passwords, se filtran igual)
 * @param {'warn'|'error'} [nivel] - 'error' para intentos de escalada/rechazos, 'warn' para el resto
 */
export function logSeguridad(evento, detalle = {}, nivel = 'warn') {
  const linea = JSON.stringify({
    timestamp: new Date().toISOString(),
    evento,
    detalle: sanitizarDetalle(detalle),
  });
  if (nivel === 'error') {
    console.error(`[SEGURIDAD] ${linea}`);
  } else {
    console.warn(`[SEGURIDAD] ${linea}`);
  }
}
