import { api } from '../shared/api.js'
import { enfocarPrimerElemento } from '../shared/dom.js'
import { state, app } from './state.js'
import { renderApp, mostrarBanner } from './render/shell.js'

// ---------------------------------------------------------------------------
// Usuarios: carga y acciones
// ---------------------------------------------------------------------------

export async function cargarUsuarios() {
  state.loadingUsuarios = true
  state.usuariosError = ''
  renderApp()
  try {
    state.usuarios = await api.get('/admin/usuarios')
  } catch (err) {
    state.usuarios = []
    state.usuariosError = err.message || 'No se pudo cargar la lista de usuarios.'
  } finally {
    state.loadingUsuarios = false
    renderApp()
  }
}

export function abrirModalCrear() {
  state.elementoDisparadorModal = document.activeElement
  const rolDefault = state.roles.find((r) => r.nombre === 'agente') ?? state.roles[0]
  state.modal = {
    tipo: 'crear',
    error: '',
    guardando: false,
    nombre: '',
    email: '',
    rol_id: rolDefault?.id ?? '',
    password: '',
    telefono: '',
  }
  renderApp()
  enfocarPrimerElemento(app.querySelector('.admin-modal'))
}

export function abrirModalEditar(usuarioId) {
  const usuario = state.usuarios.find((u) => u.id === usuarioId)
  if (!usuario) return
  state.elementoDisparadorModal = document.activeElement
  const rolActual = state.roles.find((r) => r.nombre === usuario.rol)
  state.modal = {
    tipo: 'editar',
    usuario,
    error: '',
    guardando: false,
    nombre: usuario.nombre,
    email: usuario.email,
    rol_id: usuario.rol_id ?? rolActual?.id ?? '',
    activo: Boolean(usuario.activo),
    descuento_maximo_pct: usuario.descuento_maximo_pct,
    recargo_maximo_pct: usuario.recargo_maximo_pct,
    telefono: usuario.telefono ?? '',
  }
  renderApp()
  enfocarPrimerElemento(app.querySelector('.admin-modal'))
}

export function abrirModalPassword(usuarioId) {
  const usuario = state.usuarios.find((u) => u.id === usuarioId)
  if (!usuario) return
  state.elementoDisparadorModal = document.activeElement
  state.modal = { tipo: 'password', usuario, error: '', guardando: false, password: '' }
  renderApp()
  enfocarPrimerElemento(app.querySelector('.admin-modal'))
}

export function cerrarModal() {
  state.modal = null
  renderApp()
  if (state.elementoDisparadorModal) {
    state.elementoDisparadorModal.focus()
    state.elementoDisparadorModal = null
  }
}

export async function desactivarUsuario(usuarioId) {
  const usuario = state.usuarios.find((u) => u.id === usuarioId)
  if (!usuario) return
  if (!confirm(`¿Desactivar a ${usuario.nombre}? No va a poder iniciar sesión.`)) return

  try {
    await api.put(`/admin/usuarios/${usuarioId}`, { activo: false })
    mostrarBanner('success', `${usuario.nombre} fue desactivado.`)
    await cargarUsuarios()
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo desactivar el usuario.')
  }
}

export async function eliminarUsuario(usuarioId) {
  const usuario = state.usuarios.find((u) => u.id === usuarioId)
  if (!usuario) return
  if (!confirm(`¿Eliminar a ${usuario.nombre} definitivamente? Esta acción no se puede deshacer.`))
    return

  try {
    await api.delete(`/admin/usuarios/${usuarioId}`)
    mostrarBanner('success', `${usuario.nombre} fue eliminado.`)
    await cargarUsuarios()
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo eliminar el usuario.')
  }
}

export async function guardarModalCrear(form) {
  const nombre = form.nombre.value.trim()
  const email = form.email.value.trim()
  const rol_id = Number(form.rol_id.value)
  const password = form.password.value
  const telefono = form.telefono.value.trim() || null

  if (!nombre || !email) {
    state.modal.error = 'Completá nombre y email.'
    renderApp()
    return
  }
  if (!rol_id) {
    state.modal.error = 'Elegí un rol.'
    renderApp()
    return
  }
  if (password.length < 8) {
    state.modal.error = 'La contraseña debe tener al menos 8 caracteres.'
    renderApp()
    return
  }

  state.modal.error = ''
  state.modal.guardando = true
  renderApp()

  try {
    await api.post('/admin/usuarios', { nombre, email, rol_id, password, telefono })
    cerrarModal()
    mostrarBanner('success', `Usuario ${nombre} creado.`)
    await cargarUsuarios()
  } catch (err) {
    state.modal.guardando = false
    state.modal.error = err.message || 'No se pudo crear el usuario.'
    renderApp()
  }
}

export async function guardarModalEditar(form) {
  const usuario = state.modal.usuario
  const nombre = form.nombre.value.trim()
  const email = form.email.value.trim()
  const rol_id = Number(form.rol_id.value)
  const activo = form.activo.checked
  // Campo vacío = sin tope propio (usa el tope del plan tal cual) -> se manda null.
  const descuentoMaximoPct =
    form.descuento_maximo_pct.value === '' ? null : Number(form.descuento_maximo_pct.value)
  const recargoMaximoPct =
    form.recargo_maximo_pct.value === '' ? null : Number(form.recargo_maximo_pct.value)
  const telefono = form.telefono.value.trim() || null

  if (!nombre || !email) {
    state.modal.error = 'Completá nombre y email.'
    renderApp()
    return
  }
  if (!rol_id) {
    state.modal.error = 'Elegí un rol.'
    renderApp()
    return
  }

  state.modal.error = ''
  state.modal.guardando = true
  renderApp()

  try {
    await api.put(`/admin/usuarios/${usuario.id}`, {
      nombre,
      email,
      rol_id,
      activo,
      descuento_maximo_pct: descuentoMaximoPct,
      recargo_maximo_pct: recargoMaximoPct,
      telefono,
    })
    cerrarModal()
    mostrarBanner('success', `Usuario ${usuario.nombre} actualizado.`)
    await cargarUsuarios()
  } catch (err) {
    state.modal.guardando = false
    state.modal.error = err.message || 'No se pudo actualizar el usuario.'
    renderApp()
  }
}

export async function guardarModalPassword(form) {
  const usuario = state.modal.usuario
  const password = form.password.value

  if (password.length < 8) {
    state.modal.error = 'La contraseña debe tener al menos 8 caracteres.'
    renderApp()
    return
  }

  state.modal.error = ''
  state.modal.guardando = true
  renderApp()

  try {
    await api.put(`/admin/usuarios/${usuario.id}/password`, { password })
    cerrarModal()
    mostrarBanner('success', `Contraseña de ${usuario.nombre} actualizada.`)
  } catch (err) {
    state.modal.guardando = false
    state.modal.error = err.message || 'No se pudo actualizar la contraseña.'
    renderApp()
  }
}
