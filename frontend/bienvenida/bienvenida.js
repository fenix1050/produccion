import { api, auth } from '../shared/api.js';
import { escapeHtml } from '../shared/dom.js';
import { initLoginFx } from '../login/login-fx.js';
import { ICON_ARROW_LEFT, ICON_CLOCK, ICON_RAMO_AUTO, ICON_RAMO_MRC, ICON_RAMO_INCENDIO, ICON_RAMO_VIDA_AP, ICON_RAMO_HOGAR } from '../shared/nav-icons.js';

// Pantalla de bienvenida post-login (WU7) — recreación en Vanilla JS del handoff aprobado
// (v2, ver logo/Diseño para pantalla de bienvenida/README.md). Un solo componente con 3
// estados en memoria (welcome | ramo | propuesta), sin routing por URL.

const ICON_COTIZAR = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M7 3.5h7l4 4V19a1.2 1.2 0 0 1-1.2 1.2H7A1.2 1.2 0 0 1 5.8 19V4.7A1.2 1.2 0 0 1 7 3.5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path><path d="M14 3.5V7a1 1 0 0 0 1 1h3.5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path><path d="M8.5 12h7M8.5 15h7M8.5 9h3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path></svg>`;
const ICON_PROPUESTA = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 3.5l7 2.6v5.4c0 4.4-3 7.9-7 9-4-1.1-7-4.6-7-9V6.1l7-2.6z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"></path><path d="M9.3 12.1l1.9 1.9 3.5-3.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
const ICON_ADMIN = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7"></circle><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M17.7 6.3l-1.5 1.5M7.8 16.2l-1.5 1.5M17.7 17.7l-1.5-1.5M7.8 7.8L6.3 6.3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path></svg>`;
const ICON_ARROW_UP_RIGHT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M8 7h9v9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;

// Mismos ramos/estado que muestra `frontend/cotizar/cotizar.js` (RAMOS_UI) — el código de
// estado UI (disponible/pausa/proximamente) no viene de la base, es decisión de UI.
const RAMOS_UI = [
  { nombre: 'auto', label: 'Auto', estado: 'proximamente' },
  { nombre: 'mrc', label: 'Multirriesgo Comercio', estado: 'disponible' },
  { nombre: 'incendio', label: 'Incendio', estado: 'disponible' },
  { nombre: 'vida-ap', label: 'Vida y Accidentes Personales', estado: 'disponible' },
  { nombre: 'hogar', label: 'Multirriesgo Hogar', estado: 'proximamente' },
];

const RAMO_ICONOS = {
  auto: ICON_RAMO_AUTO,
  mrc: ICON_RAMO_MRC,
  incendio: ICON_RAMO_INCENDIO,
  'vida-ap': ICON_RAMO_VIDA_AP,
  hogar: ICON_RAMO_HOGAR,
};

const ESTADO_LABEL = {
  disponible: 'Disponible',
  pausa: 'En pausa',
  proximamente: 'Próximamente',
};

const app = document.getElementById('app');

const state = {
  view: 'welcome',
  ramosActivos: [],
};

let destroyFx = null;

function ramoActivo(nombre) {
  return state.ramosActivos.find((r) => r.nombre === nombre) || null;
}

function render() {
  if (destroyFx) {
    destroyFx.forEach((fn) => fn());
    destroyFx = null;
  }

  const usuario = auth.getUsuario();
  const nombre = usuario?.nombre || usuario?.email || 'agente';

  app.innerHTML = `
    <canvas id="fx-canvas-bg"></canvas>
    <div class="bv-container">
      <header class="bv-header">
        <img class="bv-header__logo" src="./assets/logo-rojo-con-negro.svg" alt="Aseguradora Tajy" />
        <div class="bv-header__saludo">Hola, <b>${escapeHtml(nombre)}</b></div>
      </header>
      <div class="bv-fade">
        ${state.view === 'welcome' ? renderWelcome() : ''}
        ${state.view === 'ramo' ? renderRamo() : ''}
        ${state.view === 'propuesta' ? renderPropuesta() : ''}
      </div>
    </div>
  `;

  bindEvents();

  destroyFx = [
    initLoginFx(document.getElementById('fx-canvas-bg'), app, {
      particleCount: 40,
      particleColor: '216, 19, 46',
      particleAlpha: 0.3,
      linkAlpha: 0.08,
    }),
  ];
}

function renderWelcome() {
  return `
    <h1 class="bv-title">¿Qué querés hacer?</h1>
    <p class="bv-subtitle">Elegí una opción para continuar.</p>
    <div class="bv-grid">
      <button type="button" class="bv-card" data-action="ir-cotizar">
        <div class="bv-card__top">
          <div class="bv-card__icon">${ICON_COTIZAR}</div>
          <span class="bv-card__arrow">${ICON_ARROW_UP_RIGHT}</span>
        </div>
        <div class="bv-card__title">Cotizar una Póliza</div>
        <div class="bv-card__desc">Cotizá una póliza con nosotros en minutos.</div>
      </button>
      <button type="button" class="bv-card" data-action="ir-propuesta">
        <div class="bv-card__top">
          <div class="bv-card__icon">${ICON_PROPUESTA}</div>
          <span class="bv-card__arrow">${ICON_ARROW_UP_RIGHT}</span>
        </div>
        <div class="bv-card__title">Elaborar una Propuesta Formal</div>
        <div class="bv-card__desc">Armá el expediente completo con KYC/PLA-FT ya aceptado por el cliente.</div>
      </button>
      ${auth.tieneAccesoAdmin() ? `
      <button type="button" class="bv-card" data-action="ir-admin">
        <div class="bv-card__top">
          <div class="bv-card__icon">${ICON_ADMIN}</div>
          <span class="bv-card__arrow">${ICON_ARROW_UP_RIGHT}</span>
        </div>
        <div class="bv-card__title">Panel de Administración</div>
        <div class="bv-card__desc">Gestioná usuarios, coberturas, tasas y planes del sistema.</div>
      </button>
      ` : ''}
    </div>
  `;
}

function renderRamo() {
  const filas = RAMOS_UI.map((r) => {
    const disponible = r.estado === 'disponible' && ramoActivo(r.nombre);
    const estadoLabel = ESTADO_LABEL[r.estado] || '';
    const atributos = disponible
      ? `data-action="select-ramo" data-ramo="${r.nombre}"`
      : `aria-disabled="true" title="${escapeHtml(estadoLabel)}"`;
    return `
      <div class="bv-ramo-row ${disponible ? 'bv-ramo-row--disponible' : 'bv-ramo-row--deshabilitada'}" ${atributos}>
        <div class="bv-ramo-row__icon">${RAMO_ICONOS[r.nombre] || ''}</div>
        <div class="bv-ramo-row__label">${r.label}</div>
        <div class="bv-ramo-row__badge bv-ramo-row__badge--${r.estado}">${estadoLabel}</div>
      </div>
    `;
  }).join('');

  return `
    <button type="button" class="bv-volver" data-action="volver">${ICON_ARROW_LEFT} Volver</button>
    <h1 class="bv-title bv-title--sm">Elegí el ramo</h1>
    <p class="bv-subtitle">Seleccioná el ramo para el que querés cotizar.</p>
    <div class="bv-ramo-list">${filas}</div>
  `;
}

function renderPropuesta() {
  return `
    <button type="button" class="bv-volver" data-action="volver">${ICON_ARROW_LEFT} Volver</button>
    <div class="bv-placeholder">
      <div class="bv-placeholder__icon">${ICON_CLOCK}</div>
      <div class="bv-placeholder__title">Próximamente</div>
      <p class="bv-placeholder__text">La Propuesta Formal con KYC/PLA-FT todavía está en desarrollo. Por ahora podés generar la Carta Oferta desde el cotizador.</p>
    </div>
  `;
}

function bindEvents() {
  app.querySelector('[data-action="ir-cotizar"]')?.addEventListener('click', () => {
    state.view = 'ramo';
    render();
  });
  app.querySelector('[data-action="ir-propuesta"]')?.addEventListener('click', () => {
    state.view = 'propuesta';
    render();
  });
  app.querySelector('[data-action="ir-admin"]')?.addEventListener('click', () => {
    window.location.href = '../admin/';
  });
  app.querySelector('[data-action="volver"]')?.addEventListener('click', () => {
    state.view = 'welcome';
    render();
  });
  app.querySelectorAll('[data-action="select-ramo"]').forEach((el) => {
    el.addEventListener('click', () => {
      const ramo = el.dataset.ramo;
      window.location.href = `../cotizar/?ramo=${encodeURIComponent(ramo)}`;
    });
  });
}

async function init() {
  if (!auth.isLoggedIn()) {
    window.location.href = '../login/';
    return;
  }

  try {
    state.ramosActivos = await api.get('/ramos');
  } catch (err) {
    console.error('No se pudo cargar la lista de ramos', err);
    state.ramosActivos = [];
  }

  render();
}

init();
