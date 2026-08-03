import { escapeHtml } from '../../shared/dom.js'

// Helpers compartidos de las 6 variantes "editar inline" del panel admin (issue #84,
// item #6). `campoInlineInput` renderiza un único <input>/<select> a partir de una
// descripción declarativa; `renderCampoInline` arma el wrapper de lectura (admin-valor-fijo
// + botón Editar) o el <form> de edición (admin-inline-form + Guardar/Cancelar), según
// `editando`. Lo que NO se unifica a propósito es `guardar*` de cada variante — ahí vive el
// comportamiento real distinto por variante (nullable o no, endpoints, trims, NaN) y unificarlo
// sería el riesgo real de esta refactorización, no el beneficio.
export function campoInlineInput(campo) {
  const attrs = [`name="${campo.name}"`]
  if (campo.step != null) attrs.push(`step="${campo.step}"`)
  if (campo.min != null) attrs.push(`min="${campo.min}"`)
  if (campo.max != null) attrs.push(`max="${campo.max}"`)
  if (campo.placeholder) attrs.push(`placeholder="${escapeHtml(campo.placeholder)}"`)
  if (campo.form) attrs.push(`form="${campo.form}"`)
  if (campo.autofocus) attrs.push('autofocus')
  if (campo.ariaLabel) attrs.push(`aria-label="${escapeHtml(campo.ariaLabel)}"`)

  if (campo.tipo === 'select') {
    const opciones = (campo.opciones ?? [])
      .map(
        (op) =>
          `<option value="${escapeHtml(op.value)}" ${String(op.value) === String(campo.value) ? 'selected' : ''}>${escapeHtml(op.label ?? op.value)}</option>`
      )
      .join('')
    return `<select class="field-input field-input--sm" ${attrs.join(' ')}>${opciones}</select>`
  }

  const valor = campo.value ?? ''
  return `<input class="field-input field-input--sm" type="${campo.tipo ?? 'text'}" value="${escapeHtml(String(valor))}" ${attrs.join(' ')} />`
}

export function renderCampoInline({
  editando,
  id,
  planId,
  formAction,
  formId,
  accionEditar,
  accionCancelar,
  puedeEditar = true,
  wrapperClase = 'admin-valor-fijo',
  accionWrapperClase,
  lectura,
  campos = [],
}) {
  const dataPlanId = planId != null ? ` data-plan-id="${planId}"` : ''

  if (!editando) {
    const boton = puedeEditar
      ? `<button class="btn-outline" data-action="${accionEditar}" data-id="${id}"${dataPlanId}>Editar</button>`
      : ''
    const botonEnvuelto =
      boton && accionWrapperClase ? `<span class="${accionWrapperClase}">${boton}</span>` : boton
    return `
      <div class="${wrapperClase}">
        ${lectura}
        ${botonEnvuelto}
      </div>
    `
  }

  const formIdAttr = formId ? ` id="${formId}"` : ''
  const camposHtml = campos.map(campoInlineInput).join('\n      ')
  return `
    <form class="admin-inline-form"${formIdAttr} data-form-action="${formAction}" data-id="${id}"${dataPlanId}>
      ${camposHtml}
      <button class="btn-outline" type="submit">Guardar</button>
      <button class="btn-outline" type="button" data-action="${accionCancelar}" data-id="${id}">Cancelar</button>
    </form>
  `
}
