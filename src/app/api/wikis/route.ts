import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

export async function GET() {
  const { data, error } = await getServerClient()
    .from("wikis")
    .select("id, owner, repo, status, created_at, updated_at")
    .eq("status", "done")
    .eq("visibility", "public")
    // Creation time, not updated_at: regenerating or reindexing a wiki bumps
    // updated_at and would make old wikis look newly generated
    .order("created_at", { ascending: false });

  if (error) throw error;

  return NextResponse.json(data ?? [], {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=300",
    },
  });
}
