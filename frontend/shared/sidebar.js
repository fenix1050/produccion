// Bloque de navegación del sidebar (links, agente logueado, footer de confianza) —
// compartido por cotizar/historial/admin/configuración para no duplicar el mismo
// markup en cada vista. El contenido específico de cada página (lista de ramos,
// secciones del panel admin, etc.) se sigue armando en cada archivo, por encima
// de este bloque.

import { ICON_ARROW_LEFT, ICON_CLOCK, ICON_GEAR, ICON_WRENCH, ICON_LOGOUT, ICON_BELL, ICON_CHEVRON_DOWN, renderTrustFooter } from './nav-icons.js';
import { auth } from './api.js';
import { escapeHtml } from './dom.js';

function renderSidebarNavLinks(active) {
  const links = [];

  if (active !== 'cotizar') {
    links.push(`<a class="nav-item nav-item--icon" href="../cotizar/"><span class="nav-item__badge">${ICON_ARROW_LEFT}</span><span>Volver a cotizar</span></a>`);
  }

  links.push(`<a class="nav-item nav-item--icon ${active === 'historial' ? 'nav-item--active' : ''}" href="${active === 'historial' ? './' : '../historial/'}"><span class="nav-item__badge">${ICON_CLOCK}</span><span>Historial de cotizaciones</span></a>`);
  links.push(`<a class="nav-item nav-item--icon ${active === 'configuracion' ? 'nav-item--active' : ''}" href="${active === 'configuracion' ? './' : '../configuracion/'}"><span class="nav-item__badge">${ICON_GEAR}</span><span>Configuración</span></a>`);

  links.push(`<div class="nav-item nav-item--icon" data-action="logout"><span class="nav-item__badge">${ICON_LOGOUT}</span><span>Cerrar sesión</span></div>`);

  return links.join('');
}

// active: 'cotizar' | 'historial' | 'configuracion' | 'admin' | null
// El bloque de perfil del agente vive ahora en el topbar (renderTopbarUser) — ya no se
// duplica acá abajo del sidebar (pedido de Kevin al migrar a "Diseño 2").
export function renderSidebarFooter(active) {
  return `${renderSidebarNavLinks(active)}${renderTrustFooter()}`;
}

// Bloque de usuario del topbar ("Diseño 2" — mockup docs/mockups/diseno-2-app-shell.html):
// campanita de notificaciones (sin backend de notificaciones todavía, ícono inerte) + avatar
// con iniciales + nombre/rol. Mismo dato de sesión que renderSidebarAgent, distinta ubicación.
// El acceso al Panel de administración vivía antes como link fijo del sidebar — Kevin pidió
// moverlo acá, como opción del menú desplegable que abre el perfil (solo visible para rol
// admin o permisos, mismo gate que ya aplicaba en el sidebar).
// active: página actual ('admin' cuando ya se está en el panel) para no repetir el link.
export function renderTopbarUser(active) {
  const usuario = auth.getUsuario();
  const nombreAgente = usuario?.nombre || 'Agente';
  const esAdmin = usuario?.rol === 'admin';
  const rolLabel = esAdmin ? 'Administrador' : usuario?.rol === 'agente' ? 'Agente' : 'Analista comercial';
  const inicial = nombreAgente.trim().charAt(0).toUpperCase() || 'A';
  const mostrarAccesoAdmin = auth.tieneAccesoAdmin() && active !== 'admin';

  return `
    <div class="topbar__user">
      <button class="topbar__bell" type="button" aria-label="Notificaciones">${ICON_BELL}</button>
      <div class="topbar__user-menu-wrap">
        <button class="topbar__user-trigger" type="button" data-action="toggle-user-menu" aria-haspopup="true" aria-expanded="false">
          <div class="topbar__user-avatar">${escapeHtml(inicial)}</div>
          <div class="topbar__user-text">
            <div class="topbar__user-name">${escapeHtml(nombreAgente)}</div>
            <div class="topbar__user-role">${escapeHtml(rolLabel)}</div>
          </div>
          <span class="topbar__user-chevron">${ICON_CHEVRON_DOWN}</span>
        </button>
        ${mostrarAccesoAdmin ? `
          <div class="topbar__user-menu" hidden>
            <a class="topbar__user-menu-item" href="../admin/"><span class="nav-item__badge">${ICON_WRENCH}</span><span>Panel de administración</span></a>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// Delegación global (registrada una única vez para todas las páginas que usan el topbar)
// para abrir/cerrar el menú desplegable del perfil y cerrarlo al hacer click afuera.
let topbarUserMenuBound = false;
function bindTopbarUserMenuOnce() {
  if (topbarUserMenuBound) return;
  topbarUserMenuBound = true;

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-action="toggle-user-menu"]');
    const wrap = e.target.closest('.topbar__user-menu-wrap');

    document.querySelectorAll('.topbar__user-menu-wrap').forEach((otherWrap) => {
      if (otherWrap === wrap && trigger) return;
      const menu = otherWrap.querySelector('.topbar__user-menu');
      const btn = otherWrap.querySelector('.topbar__user-trigger');
      if (menu) menu.hidden = true;
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });

    if (!trigger || !wrap) return;
    const menu = wrap.querySelector('.topbar__user-menu');
    if (!menu) return;
    menu.hidden = !menu.hidden;
    trigger.setAttribute('aria-expanded', String(!menu.hidden));
  });
}
bindTopbarUserMenuOnce();
