import { api } from '../shared/api.js'
import { state } from './state.js'

// Catálogo de coberturas por ramo — compartido entre Tasas y Coberturas por plan
// (ambas secciones necesitan la lista para poblar el <select> de sus modales de alta).

export async function cargarCatalogoDeRamo(ramoId) {
  if (state.catalogoPorRamo[ramoId]) return // catálogo de coberturas no cambia en la sesión
  try {
    state.catalogoPorRamo[ramoId] = await api.get(`/ramos/${ramoId}/coberturas-catalogo`)
  } catch {
    state.catalogoPorRamo[ramoId] = []
  }
}
