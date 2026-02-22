import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Singleton Admin server client (bypasses RLS). For background jobs, admin ops, cross-user writes.
 */
let _adminClient: SupabaseClient | null = null;
export function getServerClient() {
  return (_adminClient ||= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_SUPABASE_SECRET_KEY,
  ));
}

/**
 * User-scoped server client (respects RLS). For user-facing reads/writes tied to session cookies.
 */
export async function getUserServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            /* ignore in Server Components */
          }
        },
      },
    },
  );
}
