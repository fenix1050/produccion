// Bloque de navegación del sidebar (links, agente logueado, footer de confianza) —
// compartido por cotizar/historial/admin/configuración para no duplicar el mismo
// markup en cada vista. El contenido específico de cada página (lista de ramos,
// secciones del panel admin, etc.) se sigue armando en cada archivo, por encima
// de este bloque.

import { ICON_ARROW_LEFT, ICON_CLOCK, ICON_GEAR, ICON_WRENCH, ICON_LOGOUT, renderTrustFooter } from './nav-icons.js';
import { auth } from './api.js';
import { escapeHtml } from './dom.js';

function renderSidebarNavLinks(active) {
  const usuario = auth.getUsuario();
  const esAdmin = usuario?.rol === 'admin';
  const links = [];

  if (active !== 'cotizar') {
    links.push(`<a class="nav-item nav-item--icon" href="../cotizar/"><span class="nav-item__badge">${ICON_ARROW_LEFT}</span><span>Volver a cotizar</span></a>`);
  }

  links.push(`<a class="nav-item nav-item--icon ${active === 'historial' ? 'nav-item--active' : ''}" href="${active === 'historial' ? './' : '../historial/'}"><span class="nav-item__badge">${ICON_CLOCK}</span><span>Historial de cotizaciones</span></a>`);
  links.push(`<a class="nav-item nav-item--icon ${active === 'configuracion' ? 'nav-item--active' : ''}" href="${active === 'configuracion' ? './' : '../configuracion/'}"><span class="nav-item__badge">${ICON_GEAR}</span><span>Configuración</span></a>`);

  if (esAdmin && active !== 'admin') {
    links.push(`<a class="nav-item nav-item--icon" href="../admin/"><span class="nav-item__badge">${ICON_WRENCH}</span><span>Panel de administración</span></a>`);
  }

  links.push(`<div class="nav-item nav-item--icon" data-action="logout"><span class="nav-item__badge">${ICON_LOGOUT}</span><span>Cerrar sesión</span></div>`);

  return links.join('');
}

function renderSidebarAgent() {
  const usuario = auth.getUsuario();
  const nombreAgente = usuario?.nombre || 'Agente';
  const esAdmin = usuario?.rol === 'admin';
  const rolLabel = esAdmin ? 'Administrador' : usuario?.rol === 'agente' ? 'Agente' : 'Analista comercial';
  const iniciales = nombreAgente
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || 'AG';

  return `
    <div class="sidebar__agent">
      <div class="sidebar__agent-avatar">${escapeHtml(iniciales)}</div>
      <div>
        <div class="sidebar__agent-name">${escapeHtml(nombreAgente)}</div>
        <div class="sidebar__agent-role">${escapeHtml(rolLabel)}</div>
      </div>
    </div>
  `;
}

// active: 'cotizar' | 'historial' | 'configuracion' | 'admin' | null
export function renderSidebarFooter(active) {
  return `${renderSidebarNavLinks(active)}${renderSidebarAgent()}${renderTrustFooter()}`;
}
