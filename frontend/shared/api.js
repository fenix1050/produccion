// Wrapper simple de fetch para hablar con la API — mismo patrón que Siniestros Tajy.
// Nunca se llama a Supabase directo desde acá.

const API_BASE_URL = window.API_BASE_URL || 'http://localhost:3000/api';

const TOKEN_KEY = 'tajy_token';
const USUARIO_KEY = 'tajy_usuario';

// ---- Helpers de sesión (token + usuario logueado) ----

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function getUsuario() {
  try {
    const raw = localStorage.getItem(USUARIO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setUsuario(usuario) {
  localStorage.setItem(USUARIO_KEY, JSON.stringify(usuario));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USUARIO_KEY);
}

// Ruta relativa a login desde cualquier shell (cotizar/historial/admin/login están todos
// al mismo nivel bajo frontend/, así que desde adentro de cada uno es "../login/").
function redirectToLogin() {
  const yaEnLogin = window.location.pathname.replace(/\\/g, '/').includes('/login/');
  if (yaEnLogin) return;
  window.location.href = '../login/';
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    ...options,
  });

  if (res.status === 401) {
    clearSession();
    redirectToLogin();
    throw new Error('Sesión expirada o inválida');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status} al llamar a ${path}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

async function requestBlob(path) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { ...authHeaders() },
  });

  if (res.status === 401) {
    clearSession();
    redirectToLogin();
    throw new Error('Sesión expirada o inválida');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status} al llamar a ${path}`);
  }
  return res.blob();
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
  getBlob: (path) => requestBlob(path),
};

export const auth = {
  getToken,
  setToken,
  getUsuario,
  setUsuario,
  clearSession,
  isLoggedIn: () => Boolean(getToken()),
};
