import { escapeHtml } from '../../shared/dom.js'
import { capitalizar } from '../../shared/format.js'
import { state } from '../state.js'

// Render de los modales de Usuarios (crear/editar/password) y Roles — extraído de
// admin.js (WU admin-module-split, PR4). Move verbatim, sin cambios de comportamiento.

function renderCuerpoModalCrear(m) {
  return `
    <div class="admin-modal__field">
      <label for="admin-modal-nombre">Nombre</label>
      <input class="field-input" id="admin-modal-nombre" type="text" name="nombre" value="${escapeHtml(m.nombre)}" />
    </div>
    <div class="admin-modal__field">
      <label for="admin-modal-email">Email</label>
      <input class="field-input" id="admin-modal-email" type="email" name="email" value="${escapeHtml(m.email)}" />
    </div>
    <div class="admin-modal__field">
      <label for="admin-modal-rol">Rol</label>
      <select class="field-input" id="admin-modal-rol" name="rol_id">
        ${renderOpcionesRoles(m.rol_id)}
      </select>
    </div>
    <div class="admin-modal__field">
      <label for="admin-modal-password">Contraseña (mín. 8 caracteres)</label>
      <input class="field-input" id="admin-modal-password" type="password" name="password" autocomplete="new-password" />
    </div>
    <div class="admin-modal__field">
      <label for="admin-modal-telefono">Teléfono (opcional, para la Carta Oferta)</label>
      <input class="field-input" id="admin-modal-telefono" type="text" name="telefono" value="${escapeHtml(m.telefono ?? '')}" />
    </div>
  `
}

function renderCuerpoModalEditar(m) {
  return `
    <div class="admin-modal__field">
      <label for="admin-modal-nombre">Nombre</label>
      <input class="field-input" id="admin-modal-nombre" type="text" name="nombre" value="${escapeHtml(m.nombre)}" />
    </div>
    <div class="admin-modal__field">
      <label for="admin-modal-email">Email</label>
      <input class="field-input" id="admin-modal-email" type="email" name="email" value="${escapeHtml(m.email)}" />
    </div>
    <div class="admin-modal__field">
      <label for="admin-modal-rol">Rol</label>
      <select class="field-input" id="admin-modal-rol" name="rol_id">
        ${renderOpcionesRoles(m.rol_id)}
      </select>
    </div>
    <div class="admin-modal__field">
      <label class="admin-modal__checkbox">
        <input type="checkbox" name="activo" ${m.activo ? 'checked' : ''} />
        Activo
      </label>
    </div>
    <div class="admin-modal__field">
      <label for="admin-modal-descuento">Descuento máx. propio (%) — vacío = usa el tope del plan</label>
      <input class="field-input" id="admin-modal-descuento" type="number" step="0.01" min="0" max="100" name="descuento_maximo_pct" value="${m.descuento_maximo_pct ?? ''}" />
    </div>
    <div class="admin-modal__field">
      <label for="admin-modal-recargo">Recargo máx. propio (%) — vacío = usa el tope del plan</label>
      <input class="field-input" id="admin-modal-recargo" type="number" step="0.01" min="0" max="100" name="recargo_maximo_pct" value="${m.recargo_maximo_pct ?? ''}" />
    </div>
    <div class="admin-modal__field">
      <label for="admin-modal-telefono">Teléfono (opcional, para la Carta Oferta)</label>
      <input class="field-input" id="admin-modal-telefono" type="text" name="telefono" value="${escapeHtml(m.telefono ?? '')}" />
    </div>
  `
}

function renderCuerpoModalPassword() {
  return `
    <div class="admin-modal__field">
      <label for="admin-modal-password">Nueva contraseña (mín. 8 caracteres)</label>
      <input class="field-input" id="admin-modal-password" type="password" name="password" autocomplete="new-password" />
    </div>
  `
}

// Un renderer por tipo de modal de usuario (crear/editar/password) — cada uno
// resuelve su propio título y cuerpo, evitando el if/else único que antes
// mezclaba los 3 casos en la misma función.
const RENDERERS_MODAL_USUARIO = {
  crear: {
    titulo: () => 'Nuevo usuario',
    cuerpo: renderCuerpoModalCrear,
  },
  editar: {
    titulo: (m) => `Editar ${escapeHtml(m.usuario.nombre)}`,
    cuerpo: renderCuerpoModalEditar,
  },
  password: {
    titulo: (m) => `Resetear contraseña de ${escapeHtml(m.usuario.nombre)}`,
    cuerpo: renderCuerpoModalPassword,
  },
}

export function renderModal() {
  const m = state.modal
  const renderer = RENDERERS_MODAL_USUARIO[m.tipo]
  const titulo = renderer ? renderer.titulo(m) : ''
  const cuerpo = renderer ? renderer.cuerpo(m) : ''

  return `
    <div class="admin-modal-backdrop" data-action="cerrar-modal-backdrop">
      <div class="admin-modal" data-stop-propagation="true" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title">
        <div class="admin-modal__title" id="admin-modal-title">${titulo}</div>
        ${m.error ? `<div class="admin-modal__error">${escapeHtml(m.error)}</div>` : ''}
        <form id="admin-modal-form">
          ${cuerpo}
          <div class="admin-modal__actions">
            <button type="button" class="btn-outline" data-action="cerrar-modal">Cancelar</button>
            <button type="submit" class="btn-primary" ${m.guardando ? 'disabled' : ''}>${m.guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  `
}

export function renderOpcionesRoles(rolIdSeleccionado) {
  return state.roles
    .map(
      (r) => `
    <option value="${r.id}" ${String(rolIdSeleccionado) === String(r.id) ? 'selected' : ''}>${capitalizar(escapeHtml(r.nombre))}</option>
  `
    )
    .join('')
}

export function renderModalRol() {
  const m = state.modalRol
  const titulo = m.tipo === 'crear' ? 'Crear rol' : `Editar rol: ${escapeHtml(m.nombre)}`

  return `
    <div class="admin-modal-backdrop" data-action="cerrar-modal-rol-backdrop">
      <div class="admin-modal" data-stop-propagation="true" role="dialog" aria-modal="true" aria-labelledby="admin-modal-rol-title">
        <div class="admin-modal__title" id="admin-modal-rol-title">${titulo}</div>
        ${m.error ? `<div class="admin-modal__error">${escapeHtml(m.error)}</div>` : ''}
        <form id="admin-modal-rol-form">
          <div class="admin-modal__field">
            <label for="admin-modal-rol-nombre">Nombre del rol</label>
            <input class="field-input" id="admin-modal-rol-nombre" type="text" name="nombre" maxlength="30" value="${escapeHtml(m.nombre)}" />
          </div>
          <div class="admin-modal__field">
            <label class="admin-modal__checkbox">
              <input type="checkbox" name="puede_gestionar_usuarios" ${m.puede_gestionar_usuarios ? 'checked' : ''} />
              Puede gestionar usuarios
            </label>
          </div>
          <div class="admin-modal__field">
            <label class="admin-modal__checkbox">
              <input type="checkbox" name="puede_editar_coberturas" ${m.puede_editar_coberturas ? 'checked' : ''} />
              Puede editar coberturas por plan
            </label>
          </div>
          <div class="admin-modal__field">
            <label class="admin-modal__checkbox">
              <input type="checkbox" name="puede_editar_tasas" ${m.puede_editar_tasas ? 'checked' : ''} />
              Puede editar tasas
            </label>
          </div>
          <div class="admin-modal__field">
            <label class="admin-modal__checkbox">
              <input type="checkbox" name="puede_editar_planes" ${m.puede_editar_planes ? 'checked' : ''} />
              Puede editar planes
            </label>
          </div>
          <div class="admin-modal__field">
            <label class="admin-modal__checkbox">
              <input type="checkbox" name="puede_editar_descuento_plan" ${m.puede_editar_descuento_plan ? 'checked' : ''} />
              Puede editar el descuento fijo de un plan
            </label>
          </div>
          <div class="admin-modal__field">
            <label class="admin-modal__checkbox">
              <input type="checkbox" name="puede_ver_descuento_plan" ${m.puede_ver_descuento_plan ? 'checked' : ''} />
              Puede ver el descuento fijo de un plan
            </label>
          </div>
          <div class="admin-modal__field">
            <label class="admin-modal__checkbox">
              <input type="checkbox" name="puede_agregar_cobertura_libre" ${m.puede_agregar_cobertura_libre ? 'checked' : ''} />
              Puede agregar coberturas libremente (sin esto, solo checkboxes fijos)
            </label>
          </div>
          <div class="admin-modal__field">
            <label class="admin-modal__checkbox">
              <input type="checkbox" name="puede_seleccionar_franquicia" ${m.puede_seleccionar_franquicia ? 'checked' : ''} />
              Puede seleccionar franquicia en MRC
            </label>
          </div>
          <div class="admin-modal__actions">
            <button type="button" class="btn-outline" data-action="cerrar-modal-rol">Cancelar</button>
            <button type="submit" class="btn-primary" ${m.guardando ? 'disabled' : ''}>${m.guardando ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </form>
      </div>
    </div>
  `
}
