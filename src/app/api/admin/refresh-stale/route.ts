import { NextResponse } from "next/server";
import { getSupabaseUser, getSupabaseSession } from "@/lib/supabase/server";
import { isAdminEmail } from "@shared/constants";

/** Run the scheduled freshness check now */
export async function POST() {
  const user = await getSupabaseUser();
  if (!user?.email || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSupabaseSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = await fetch(
    `${process.env.BACKEND_BASE_URL}/refresh-stale`,
    {
      method: "POST",
      headers: {
        "User-Agent": "wikicube/1.0",
        Authorization: `Bearer ${session.access_token}`,
      },
    },
  );
  if (!response.ok) {
    return NextResponse.json(
      { error: "Failed to start the freshness check" },
      { status: response.status },
    );
  }
  return NextResponse.json({ ok: true }, { status: 202 });
}
