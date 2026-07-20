import { supabase } from '../config/supabase.js';

// Migración 031: `rol` (string) + los 4 booleanos sueltos de permisos se reemplazaron
// por `roles` (tabla configurable) referenciada vía `usuarios.rol_id`. Este repository
// hace el join con Supabase JS y APLANA el resultado (rol = roles.nombre, los 4 puede_*
// al nivel superior) para que middleware/auth.js (armado de req.usuario) y cualquier
// código downstream que lea `usuario.rol` / `usuario.puede_editar_tasas` etc. no necesiten
// cambiar — ver docs/ESTADO_PROYECTO.md.
const CAMPOS_ROL = 'roles(nombre, puede_editar_tasas, puede_gestionar_usuarios, puede_editar_coberturas, puede_editar_planes)';

function aplanar(usuario) {
  if (!usuario) return usuario;
  const { roles, ...resto } = usuario;
  return {
    ...resto,
    rol: roles?.nombre ?? null,
    puede_editar_tasas: roles?.puede_editar_tasas ?? false,
    puede_gestionar_usuarios: roles?.puede_gestionar_usuarios ?? false,
    puede_editar_coberturas: roles?.puede_editar_coberturas ?? false,
    puede_editar_planes: roles?.puede_editar_planes ?? false,
  };
}

export async function findByEmail(email) {
  const { data, error } = await supabase
    .from('usuarios')
    .select(`id, nombre, email, rol_id, ${CAMPOS_ROL}, activo, password_hash, ultima_sesion, descuento_maximo_pct, recargo_maximo_pct`)
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;
  return aplanar(data);
}

export async function findById(id) {
  const { data, error } = await supabase
    .from('usuarios')
    .select(`id, nombre, email, rol_id, ${CAMPOS_ROL}, activo, password_hash, ultima_sesion, descuento_maximo_pct, recargo_maximo_pct`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return aplanar(data);
}

export async function actualizarUltimaSesion(id) {
  const { error } = await supabase
    .from('usuarios')
    .update({ ultima_sesion: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// --- Fase 5 / WU3: gestión de usuarios desde el panel admin ---

// Nunca selecciona password_hash: esta lista se expone directo al frontend admin.
export async function findAll() {
  const { data, error } = await supabase
    .from('usuarios')
    .select(`id, nombre, email, rol_id, ${CAMPOS_ROL}, activo, ultima_sesion, descuento_maximo_pct, recargo_maximo_pct`)
    .order('id');
  if (error) throw error;
  return (data ?? []).map(aplanar);
}

export async function crear({ nombre, email, rol_id, password_hash }) {
  const { data, error } = await supabase
    .from('usuarios')
    .insert({
      nombre,
      email,
      rol_id,
      password_hash,
      activo: true,
    })
    .select(`id, nombre, email, rol_id, ${CAMPOS_ROL}, activo, ultima_sesion, descuento_maximo_pct, recargo_maximo_pct`)
    .single();
  if (error) throw error;
  return aplanar(data);
}

export async function actualizar(id, cambios) {
  const { data, error } = await supabase
    .from('usuarios')
    .update(cambios)
    .eq('id', id)
    .select(`id, nombre, email, rol_id, ${CAMPOS_ROL}, activo, ultima_sesion, descuento_maximo_pct, recargo_maximo_pct`)
    .maybeSingle();
  if (error) throw error;
  return aplanar(data);
}

export async function actualizarPassword(id, password_hash) {
  const { error } = await supabase.from('usuarios').update({ password_hash }).eq('id', id);
  if (error) throw error;
}
