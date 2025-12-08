import { createClient } from "@supabase/supabase-js";

// Must use NEXT_PUBLIC_ for browser code
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase = null;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase env vars missing: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

export default supabase;
