import { api } from '../shared/api.js'
import { state } from './state.js'
import { renderApp, mostrarBanner } from './render/shell.js'

// Textos legales de Propuesta Formal — movido acá desde el wizard de emisión
// (frontend/propuestas/propuestas.js: renderTextControls()/publicarTexto()), que era el
// único lugar de toda la app donde se podían publicar/actualizar estos textos. Mismo
// endpoint (GET/POST /propuestas/textos) y mismo permiso (puede_gestionar_textos_propuesta).

export async function cargarTextosPropuesta() {
  state.textosPropuesta.loading = true
  state.textosPropuesta.error = ''
  renderApp()
  try {
    const resultado = await api.get('/propuestas/textos')
    state.textosPropuesta.datos = resultado.textos ?? []
    state.textosPropuesta.faltantes = resultado.faltantes ?? []
  } catch (err) {
    state.textosPropuesta.datos = []
    state.textosPropuesta.error = err.message || 'No se pudo cargar los textos de Propuesta Formal.'
  } finally {
    state.textosPropuesta.loading = false
    renderApp()
  }
}

export async function guardarTextoPropuesta(form) {
  const clave = form.clave.value.trim()
  const contenido = form.contenido.value.trim()
  const motivo = form.motivo.value.trim()
  if (!clave || !contenido || !motivo) return

  state.textosPropuesta.guardando = true
  renderApp()
  try {
    await api.post('/propuestas/textos', { clave, contenido, motivo })
    mostrarBanner('success', `Texto "${clave}" publicado.`)
    form.reset()
    await cargarTextosPropuesta()
  } catch (err) {
    mostrarBanner('error', err.message || 'No se pudo publicar el texto.')
  } finally {
    state.textosPropuesta.guardando = false
    renderApp()
  }
}
