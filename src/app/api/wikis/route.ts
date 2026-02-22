import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const db = getServerClient();
    const { data, error } = await db
      .from("wikis")
      .select("id, owner, repo, status, created_at, updated_at")
      .eq("status", "done")
      .order("updated_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("Failed to fetch wikis:", err);
    return NextResponse.json([], { status: 500 });
  }
}
