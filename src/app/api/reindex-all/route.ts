import { NextResponse } from "next/server";
import { getSupabaseUser, getSupabaseSession } from "@/lib/supabase/server";
import { ADMIN_EMAILS } from "@shared/constants";

export async function POST() {
  const user = await getSupabaseUser();
  if (!user?.email || !ADMIN_EMAILS.has(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await getSupabaseSession();
  // fire and forget
  void fetch(`${process.env.BACKEND_BASE_URL}/reindex-all`, {
    method: "POST",
    body: JSON.stringify({}),
    headers: {
      "content-type": "application/json",
      "User-Agent": "wikicube/1.0",
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
    },
  });

  return NextResponse.json({ ok: true, message: "Reindexing in progress" });
}
