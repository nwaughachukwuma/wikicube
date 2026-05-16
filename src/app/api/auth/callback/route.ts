import { NextRequest, NextResponse } from "next/server";
import { getUserServerClient } from "@/lib/supabase/server";
import { logger } from "@shared/logger";

const log = logger("auth:callback");

/**
 * OAuth callback handler — Supabase exchanges the code for a session
 * and sets the auth cookie, then redirects back to the app.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  const safeNext = next && next.startsWith("/") ? next : "/";
  const isLocalEnv = process.env.NODE_ENV === "development";
  const forwardedHost = req.headers.get("x-forwarded-host");

  if (code) {
    const supabase = await getUserServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      log.error("Error in /api/auth/callback", { error });
    }
  }

  if (!isLocalEnv && forwardedHost) {
    return NextResponse.redirect(`https://${forwardedHost}${next}`);
  }
  return NextResponse.redirect(new URL(safeNext, req.url));
}
