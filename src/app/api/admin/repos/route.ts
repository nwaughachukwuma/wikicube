import { NextResponse } from "next/server";
import { getServerClient, getSupabaseUser } from "@/lib/supabase/server";
import { ADMIN_EMAILS } from "@shared/constants";

export async function GET() {
  const user = await getSupabaseUser();
  if (!user?.email || !ADMIN_EMAILS.has(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await getServerClient()
    .from("wikis")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ wikis: data });
}
