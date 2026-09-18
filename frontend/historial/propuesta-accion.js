// Decisión pura (sin DOM) de qué acción ofrecer desde Historial para una carta apta
// (fila de `GET /propuestas/cartas-aptas`). Reemplaza el `if` inline que antes vivía en
// historial.js y que siempre ofrecía "Preparar propuesta" incluso cuando la propuesta ya
// estaba emitida/anulada/reemplazada.
//
// IMPORTANTE: la rama "sin propuesta" preserva el literal EXACTO `../propuestas/?carta=`
// porque frontend/propuestas/propuestas.test.js:18 lo asertea contra el código fuente de
// historial.js (`/\.\.\/propuestas\/\?carta=/`) — no cambiar ese string.
//
// Degradación: si la carta no trae los campos nuevos de la migración 075
// (`tiene_propuesta`/`propuesta_actual_id`/`propuesta_actual_estado`/`propuesta_actual_numero`
// todos ausentes — backend viejo, 075 aún no aplicada en TEST), se cae exactamente al
// comportamiento anterior: `propuesta_borrador_id` decide Reabrir vs Preparar, siempre con
// href `../propuestas/?carta=<id>`.

const ESTADOS_VIVOS = ['borrador', 'en_revision', 'generando_pdf', 'error_pdf']
const ESTADOS_TERMINALES_LISTADO = ['emitida', 'anulada', 'reemplazada']

function tieneCampos075(carta) {
  return (
    carta.tiene_propuesta !== undefined ||
    carta.propuesta_actual_id !== undefined ||
    carta.propuesta_actual_estado !== undefined ||
    carta.propuesta_actual_numero !== undefined
  )
}

export function decidirAccionPropuesta(carta) {
  if (!carta) return null

  if (!tieneCampos075(carta)) {
    // Degradación pre-075: mismo criterio y mismo href que el historial.js actual.
    return {
      label: carta.propuesta_borrador_id ? 'Reabrir propuesta' : 'Preparar propuesta',
      href: `../propuestas/?carta=${carta.id}`,
    }
  }

  if (
    carta.propuesta_actual_id &&
    ESTADOS_TERMINALES_LISTADO.includes(carta.propuesta_actual_estado)
  ) {
    return {
      label: 'Ver propuestas',
      href: `../propuestas-listado/?carta_oferta_id=${carta.id}`,
    }
  }

  if (carta.propuesta_actual_id && ESTADOS_VIVOS.includes(carta.propuesta_actual_estado)) {
    return {
      label: 'Reabrir propuesta',
      href: `../propuestas/?propuesta=${carta.propuesta_actual_id}`,
    }
  }

  return {
    label: 'Preparar propuesta',
    href: `../propuestas/?carta=${carta.id}`,
  }
}
