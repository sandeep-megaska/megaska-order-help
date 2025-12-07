// lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

// Re-use existing env vars
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

let supabase = null;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase env vars missing: SUPABASE_URL / SUPABASE_ANON_KEY"
  );
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

export default supabase;
