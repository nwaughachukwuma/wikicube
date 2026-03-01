import { NextRequest, NextResponse } from "next/server";
import { getWiki, getFeatures } from "@/lib/db";
import { getSupabaseUser } from "@/lib/supabase/server";
import { privateWikiGuard } from "@/lib/db.utils";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;
  // Always read fresh from DB to avoid serving stale status after generation
  const wiki = await getWiki(owner, repo);
  if (!wiki) {
    return NextResponse.json({ error: "Wiki not found" }, { status: 404 });
  }

  if (wiki.visibility === "private") {
    const user = await getSupabaseUser();
    const error = privateWikiGuard(wiki, user?.id);
    if (error) return error;
  }

  const features = await getFeatures(wiki.id);
  return NextResponse.json(
    { wiki, features },
    {
      // Only cache completed wikis
      ...(wiki.status === "done" &&
        features.length && {
          headers: {
            "Cache-Control":
              "public, s-maxage=3600, stale-while-revalidate=300",
          },
        }),
    },
  );
}
