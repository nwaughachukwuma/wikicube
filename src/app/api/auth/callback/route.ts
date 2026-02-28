import { NextRequest, NextResponse } from "next/server";
import { getUserServerClient } from "@/lib/supabase/server";

/**
 * OAuth callback handler — Supabase exchanges the code for a session
 * and sets the auth cookie, then redirects back to the app.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await getUserServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, req.url));
}
