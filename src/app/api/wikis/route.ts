import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

export async function GET() {
  const { data, error } = await getServerClient()
    .from("wikis")
    .select("id, owner, repo, status, created_at, updated_at")
    .eq("status", "done")
    .eq("visibility", "public")
    .order("updated_at", { ascending: false });

  if (error) throw error;

  return NextResponse.json(data ?? []);
}
