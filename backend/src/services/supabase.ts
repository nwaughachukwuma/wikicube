import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _adminClient: SupabaseClient | null = null;

export function getServerClient() {
  return (_adminClient ||= createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  ));
}

export async function getSupabaseUser(token?: string) {
  if (!token) return null;
  const supabase = getServerClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function getSupabaseSession(token?: string) {
  if (!token) return null;
  const supabase = getServerClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;
  return data.session;
}
