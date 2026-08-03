import { renderApp } from './render/shell.js'

// Helpers compartidos por las variantes "editar inline" del panel admin (nombre de ramo,
// prima técnica mínima, topes de plan, tasa RPF, tasa edificio/contenido, monto/franquicia):
// todas comparten el mismo mecanismo de estado (un Set de ids en edición) para habilitar y
// cancelar la edición — la única diferencia entre variantes es qué Set usan, así que las
// funciones nombradas de cada variante (habilitarEdicionTasaRpf, etc.) quedan como wrappers
// finos que delegan acá, sin cambiar la firma que ya usan los switches de onActionClick.
export function habilitarEdicionInline(set, id) {
  set.add(id)
  renderApp()
}

export function cancelarEdicionInline(set, id) {
  set.delete(id)
  renderApp()
}
