import { supabase } from '../config/supabase.js';

const CAMPOS_PERMISOS = 'puede_editar_tasas, puede_gestionar_usuarios, puede_editar_coberturas, puede_editar_planes';

export async function findByEmail(email) {
  const { data, error } = await supabase
    .from('usuarios')
    .select(`id, nombre, email, rol, ${CAMPOS_PERMISOS}, activo, password_hash, ultima_sesion, descuento_maximo_pct, recargo_maximo_pct`)
    .eq('email', email)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function findById(id) {
  const { data, error } = await supabase
    .from('usuarios')
    .select(`id, nombre, email, rol, ${CAMPOS_PERMISOS}, activo, password_hash, ultima_sesion, descuento_maximo_pct, recargo_maximo_pct`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
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
    .select(`id, nombre, email, rol, ${CAMPOS_PERMISOS}, activo, ultima_sesion, descuento_maximo_pct, recargo_maximo_pct`)
    .order('id');
  if (error) throw error;
  return data;
}

export async function crear({
  nombre,
  email,
  rol,
  puede_editar_tasas,
  puede_gestionar_usuarios,
  puede_editar_coberturas,
  puede_editar_planes,
  password_hash,
}) {
  const { data, error } = await supabase
    .from('usuarios')
    .insert({
      nombre,
      email,
      rol,
      puede_editar_tasas,
      puede_gestionar_usuarios,
      puede_editar_coberturas,
      puede_editar_planes,
      password_hash,
      activo: true,
    })
    .select(`id, nombre, email, rol, ${CAMPOS_PERMISOS}, activo, ultima_sesion, descuento_maximo_pct, recargo_maximo_pct`)
    .single();
  if (error) throw error;
  return data;
}

export async function actualizar(id, cambios) {
  const { data, error } = await supabase
    .from('usuarios')
    .update(cambios)
    .eq('id', id)
    .select(`id, nombre, email, rol, ${CAMPOS_PERMISOS}, activo, ultima_sesion, descuento_maximo_pct, recargo_maximo_pct`)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function actualizarPassword(id, password_hash) {
  const { error } = await supabase.from('usuarios').update({ password_hash }).eq('id', id);
  if (error) throw error;
}
