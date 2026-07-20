import { supabase } from '../config/supabase.js';

const CAMPOS = 'id, nombre, puede_editar_tasas, puede_gestionar_usuarios, puede_editar_coberturas, puede_editar_planes, es_sistema, activo, created_at, updated_at';

export async function findAll() {
  const { data, error } = await supabase
    .from('roles')
    .select(CAMPOS)
    .order('id');
  if (error) throw error;
  return data;
}

export async function findById(id) {
  const { data, error } = await supabase
    .from('roles')
    .select(CAMPOS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function crear({
  nombre,
  puede_editar_tasas,
  puede_gestionar_usuarios,
  puede_editar_coberturas,
  puede_editar_planes,
}) {
  const { data, error } = await supabase
    .from('roles')
    .insert({
      nombre,
      puede_editar_tasas,
      puede_gestionar_usuarios,
      puede_editar_coberturas,
      puede_editar_planes,
      es_sistema: false,
    })
    .select(CAMPOS)
    .single();
  if (error) throw error;
  return data;
}

export async function actualizar(id, cambios) {
  const { data, error } = await supabase
    .from('roles')
    .update({ ...cambios, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(CAMPOS)
    .maybeSingle();
  if (error) throw error;
  return data;
}
