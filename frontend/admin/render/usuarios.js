import { auth } from '../../shared/api.js'
import { crearBadge } from '../../shared/badge.js'
import { escapeHtml } from '../../shared/dom.js'
import { capitalizar } from '../../shared/format.js'
import { state } from '../state.js'

// Render de la sección Usuarios (tabla de usuarios + tabla de roles) — extraído de
// admin.js (WU admin-module-split, PR3). Ambas tablas se renderizan juntas porque
// comparten la misma sección del panel (ver renderSeccion en admin.js).

// Colores de badge para roles no-admin (admin usa 'primary' fijo). Se asigna por hash
// del nombre de rol en vez de por índice/orden de carga, así el color de un rol no
// cambia entre refrescos aunque cambie el orden en que vuelve del backend.
const PALETA_BADGE_ROLES = ['info', 'purple', 'teal', 'indigo', 'amber', 'cyan', 'brown']

export function varianteBadgeRol(nombreRol) {
  if (nombreRol === 'admin') return 'primary'
  let hash = 0
  for (let i = 0; i < nombreRol.length; i++) {
    hash = (hash * 31 + nombreRol.charCodeAt(i)) | 0
  }
  const indice = Math.abs(hash) % PALETA_BADGE_ROLES.length
  return PALETA_BADGE_ROLES[indice]
}

export function renderUsuarios() {
  return `
    <div class="panel card">
      <div class="card__title card__title--toolbar">
        <span>Usuarios</span>
        <button class="btn-primary btn-primary--sm" data-action="crear-usuario">+ Nuevo usuario</button>
      </div>
      <div class="card__body">
        ${renderTablaUsuarios()}
      </div>
    </div>
    <div class="panel card">
      <div class="card__title card__title--toolbar">
        <span>Roles</span>
        <button class="btn-primary btn-primary--sm" data-action="crear-rol">+ Crear rol</button>
      </div>
      <div class="card__body">
        ${renderTablaRoles()}
      </div>
    </div>
  `
}

function renderTablaRoles() {
  if (state.loadingRoles) {
    return '<div class="empty-state__subtitle"><span class="spinner" aria-hidden="true"></span> Cargando roles…</div>'
  }
  if (state.rolesError) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(state.rolesError)}</div>`
  }
  if (!state.roles.length) {
    return '<div class="empty-state__subtitle">Todavía no hay roles cargados.</div>'
  }

  const filas = state.roles
    .map(
      (r) => `
    <tr>
      <td data-label="Rol">${capitalizar(escapeHtml(r.nombre))}</td>
      <td data-label="Gestiona usuarios">${crearBadge(r.puede_gestionar_usuarios ? 'Sí' : 'No', r.puede_gestionar_usuarios ? 'success' : 'neutral')}</td>
      <td data-label="Edita coberturas">${crearBadge(r.puede_editar_coberturas ? 'Sí' : 'No', r.puede_editar_coberturas ? 'success' : 'neutral')}</td>
      <td data-label="Edita tasas">${crearBadge(r.puede_editar_tasas ? 'Sí' : 'No', r.puede_editar_tasas ? 'success' : 'neutral')}</td>
      <td data-label="Edita planes">${crearBadge(r.puede_editar_planes ? 'Sí' : 'No', r.puede_editar_planes ? 'success' : 'neutral')}</td>
      <td data-label="Edita descuento">${crearBadge(r.puede_editar_descuento_plan ? 'Sí' : 'No', r.puede_editar_descuento_plan ? 'success' : 'neutral')}</td>
      <td data-label="Ve descuento">${crearBadge(r.puede_ver_descuento_plan ? 'Sí' : 'No', r.puede_ver_descuento_plan ? 'success' : 'neutral')}</td>
      <td data-label="Coberturas libres">${crearBadge(r.puede_agregar_cobertura_libre ? 'Sí' : 'No', r.puede_agregar_cobertura_libre ? 'success' : 'neutral')}</td>
      <td data-label="Acciones">
        <div class="admin-table__actions">
          ${
            r.es_sistema
              ? '<button class="btn-outline" disabled title="Rol del sistema — no se puede editar">Editar</button>'
              : `<button class="btn-outline" data-action="editar-rol" data-id="${r.id}">Editar</button>`
          }
          ${
            r.es_sistema
              ? '<button class="btn-outline" disabled title="Rol del sistema — no se puede eliminar">Eliminar</button>'
              : `<button class="btn-outline" data-action="eliminar-rol" data-id="${r.id}">Eliminar</button>`
          }
        </div>
      </td>
    </tr>
  `
    )
    .join('')

  return `
    <div class="admin-table-scroll">
      <table class="admin-table admin-table--roles">
        <thead>
          <tr>
            <th>Rol</th>
            <th>Gestiona usuarios</th>
            <th>Edita coberturas</th>
            <th>Edita tasas</th>
            <th>Edita planes</th>
            <th title="Edita descuento del plan">Edita descuento</th>
            <th title="Ve descuento del plan">Ve descuento</th>
            <th title="Agrega coberturas libremente">Coberturas libres</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  `
}

function renderTablaUsuarios() {
  if (state.loadingUsuarios) {
    return '<div class="empty-state__subtitle"><span class="spinner" aria-hidden="true"></span> Cargando usuarios…</div>'
  }
  if (state.usuariosError) {
    return `<div class="admin-banner admin-banner--error">${escapeHtml(state.usuariosError)}</div>`
  }
  if (!state.usuarios.length) {
    return '<div class="empty-state__subtitle">Todavía no hay usuarios cargados.</div>'
  }

  const usuarioActual = auth.getUsuario()
  const usuarioActualId = usuarioActual?.id
  const solicitanteEsAdmin = usuarioActual?.rol === 'admin'

  const filas = state.usuarios
    .map((u) => {
      // Mismo criterio que el service (admin.service.js#asegurarPuedeModificarAdmin /
      // #eliminarUsuario): un usuario admin solo puede ser tocado (editado, desactivado,
      // password reseteado, eliminado) por otro admin, sin importar qué permisos booleanos
      // tenga el rol custom de quien está mirando el panel.
      const puedeModificar = u.rol !== 'admin' || solicitanteEsAdmin
      const puedeEliminar = u.id !== usuarioActualId && puedeModificar
      return `
    <tr>
      <td data-label="Nombre">${escapeHtml(u.nombre)}</td>
      <td data-label="Email">${escapeHtml(u.email)}</td>
      <td data-label="Rol">${crearBadge(capitalizar(u.rol), varianteBadgeRol(u.rol))}</td>
      <td data-label="Estado">${crearBadge(u.activo ? 'Activo' : 'Inactivo', u.activo ? 'success' : 'neutral')}</td>
      <td data-label="Acciones">
        <div class="admin-table__actions">
          ${puedeModificar ? `<button class="btn-outline" data-action="editar-usuario" data-id="${u.id}">Editar</button>` : ''}
          ${puedeModificar ? `<button class="btn-outline" data-action="password-usuario" data-id="${u.id}">Resetear password</button>` : ''}
          ${u.activo && puedeModificar ? `<button class="btn-outline" data-action="desactivar-usuario" data-id="${u.id}">Desactivar</button>` : ''}
          ${!u.activo && puedeModificar ? `<button class="btn-outline" data-action="reactivar-usuario" data-id="${u.id}">Reactivar</button>` : ''}
          ${puedeEliminar ? `<button class="btn-outline" data-action="eliminar-usuario" data-id="${u.id}">Eliminar</button>` : ''}
        </div>
      </td>
    </tr>
  `
    })
    .join('')

  return `
    <div class="admin-table-scroll">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Email</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  `
}
