import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

// renderSidebarFooter(active) incluye internamente renderSidebarNavLinks(active) (no
// exportado por separado) — se asertea sobre el HTML resultante, mismo patrón que los
// demás tests de fuente/markup de este repo quand no hace falta montar la página entera.

const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'http://localhost/historial/' })
globalThis.window = dom.window
globalThis.document = dom.window.document

const { auth } = await import('./api.js')
const { renderSidebarFooter } = await import('./sidebar.js')

test("active:'propuestas-listado' → item con href='./' y resaltado", () => {
  const html = renderSidebarFooter('propuestas-listado')
  assert.match(
    html,
    /href="\.\/"[^>]*>[\s\S]*?Propuestas Formales|Propuestas Formales[\s\S]*?href="\.\/"/
  )
  const match = html.match(
    /<a class="nav-item[^"]*"[^>]*href="\.\/"[^>]*>[\s\S]*?Propuestas Formales/
  )
  assert.ok(match, 'no se encontró el item de Propuestas Formales apuntando a ./')
  assert.match(match[0], /nav-item--active/)
})

test("active:'propuestas' (wizard) → item de Propuestas Formales resaltado, apunta a ../propuestas-listado/", () => {
  const html = renderSidebarFooter('propuestas')
  const match = html.match(
    /<a class="nav-item[^"]*"[^>]*href="\.\.\/propuestas-listado\/"[^>]*>[\s\S]*?Propuestas Formales/
  )
  assert.ok(
    match,
    'no se encontró el item de Propuestas Formales apuntando a ../propuestas-listado/'
  )
  assert.match(match[0], /nav-item--active/)
})

test("active:'historial' → el item de Propuestas Formales NO está resaltado", () => {
  const html = renderSidebarFooter('historial')
  const match = html.match(
    /<a class="nav-item[^"]*"[^>]*href="\.\.\/propuestas-listado\/"[^>]*>[\s\S]*?Propuestas Formales/
  )
  assert.ok(match, 'el item de Propuestas Formales debería seguir presente')
  assert.doesNotMatch(match[0], /nav-item--active/)
})
