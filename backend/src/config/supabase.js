import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error(
    'Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY en el .env — copiar .env.example y completar.'
  );
}

// Cliente único para todo el backend. Los repositories son el ÚNICO lugar
// que debe importar esto — nunca desde controllers o services directamente.
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});
