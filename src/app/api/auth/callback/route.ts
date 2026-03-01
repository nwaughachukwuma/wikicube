import { NextRequest, NextResponse } from "next/server";
import { getUserServerClient } from "@/lib/supabase/server";

/**
 * OAuth callback handler — Supabase exchanges the code for a session
 * and sets the auth cookie, then redirects back to the app.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  if (code) {
    const supabase = await getUserServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  const next = searchParams.get("next");
  const safeNext = next && next.startsWith("/") ? next : "/";
  return NextResponse.redirect(new URL(safeNext, req.url));
}
