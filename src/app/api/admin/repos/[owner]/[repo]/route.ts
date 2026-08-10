import { NextRequest, NextResponse } from "next/server";
import { getServerClient, getSupabaseUser } from "@/lib/supabase/server";
import { isAdminEmail } from "@shared/constants";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const user = await getSupabaseUser();
  if (!user?.email || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { owner, repo } = await params;

  const { error } = await getServerClient()
    .from("wikis")
    .delete()
    .eq("owner", owner)
    .eq("repo", repo);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
