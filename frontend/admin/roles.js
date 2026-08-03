import { api } from '../shared/api.js'
import { enfocarPrimerElemento } from '../shared/dom.js'
import { capitalizar } from '../shared/format.js'
import { state, app } from './state.js'
import { renderApp, mostrarBanner } from './render/shell.js'

// ---------------------------------------------------------------------------
// Roles: carga y acciones (migración 031)
// ---------------------------------------------------------------------------

export async function cargarRoles() {
  state.loadingRoles = true
  state.rolesError = ''
  renderApp()
  try {
    state.roles = await api.get('/admin/roles')
  } catch (err) {
    state.roles = []
    state.rolesError = err.message || 'No se pudo cargar la lista de roles.'
  } finally {
    state.loadingRoles = false
    renderApp()
  }
}

export async function eliminarRol(rolId) {
  const rol = state.roles.find((r) => r.id === rolId)
  if (!rol) return
  if (
    !confirm(
      `¿Eliminar el rol "${capitalizar(rol.nombre)}" definitivamente? Esta acción no se puede deshacer.`
    )
  )
    return

  try {
    await api.delete(`/admin/roles/${rolId}`)
    mostrarBanner('success', `Rol "${capitalizar(rol.nombre)}" eliminado.`)
    await cargarRoles()
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo eliminar el rol.')
  }
}

export function abrirModalRolCrear() {
  state.elementoDisparadorModal = document.activeElement
  state.modalRol = {
    tipo: 'crear',
    error: '',
    guardando: false,
    nombre: '',
    puede_editar_tasas: false,
    puede_gestionar_usuarios: false,
    puede_editar_coberturas: false,
    puede_editar_planes: false,
    puede_editar_descuento_plan: false,
    puede_ver_descuento_plan: true,
  }
  renderApp()
  enfocarPrimerElemento(app.querySelector('.admin-modal'))
}

export function abrirModalRolEditar(rolId) {
  const rol = state.roles.find((r) => r.id === rolId)
  if (!rol || rol.es_sistema) return // roles del sistema no son editables desde el panel
  state.elementoDisparadorModal = document.activeElement
  state.modalRol = {
    tipo: 'editar',
    rolId: rol.id,
    error: '',
    guardando: false,
    nombre: rol.nombre,
    puede_editar_tasas: Boolean(rol.puede_editar_tasas),
    puede_gestionar_usuarios: Boolean(rol.puede_gestionar_usuarios),
    puede_editar_coberturas: Boolean(rol.puede_editar_coberturas),
    puede_editar_planes: Boolean(rol.puede_editar_planes),
    puede_editar_descuento_plan: Boolean(rol.puede_editar_descuento_plan),
    puede_ver_descuento_plan: Boolean(rol.puede_ver_descuento_plan),
  }
  renderApp()
  enfocarPrimerElemento(app.querySelector('.admin-modal'))
}

export function cerrarModalRol() {
  state.modalRol = null
  renderApp()
  if (state.elementoDisparadorModal) {
    state.elementoDisparadorModal.focus()
    state.elementoDisparadorModal = null
  }
}

export async function guardarModalRol(form) {
  const nombre = form.nombre.value.trim()
  const datos = {
    nombre,
    puede_editar_tasas: form.puede_editar_tasas.checked,
    puede_gestionar_usuarios: form.puede_gestionar_usuarios.checked,
    puede_editar_coberturas: form.puede_editar_coberturas.checked,
    puede_editar_planes: form.puede_editar_planes.checked,
    puede_editar_descuento_plan: form.puede_editar_descuento_plan.checked,
    puede_ver_descuento_plan: form.puede_ver_descuento_plan.checked,
  }

  if (!nombre) {
    state.modalRol.error = 'Completá el nombre del rol.'
    renderApp()
    return
  }

  state.modalRol.error = ''
  state.modalRol.guardando = true
  renderApp()

  try {
    if (state.modalRol.tipo === 'crear') {
      await api.post('/admin/roles', datos)
      mostrarBanner('success', `Rol ${nombre} creado.`)
    } else {
      await api.put(`/admin/roles/${state.modalRol.rolId}`, datos)
      mostrarBanner('success', `Rol ${nombre} actualizado.`)
    }
    cerrarModalRol()
    await cargarRoles()
    // Repuebla el select de rol de un modal de usuario abierto, si lo hay, para que
    // el rol recién creado/editado aparezca sin tener que cerrar y reabrir el modal.
    renderApp()
  } catch (err) {
    state.modalRol.guardando = false
    state.modalRol.error = err.message || 'No se pudo guardar el rol.'
    renderApp()
  }
}
