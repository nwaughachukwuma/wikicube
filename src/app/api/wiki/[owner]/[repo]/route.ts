import { NextRequest, NextResponse } from "next/server";
import { getCachedWiki, getCachedFeatures } from "@/lib/cache";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;
  const wiki = await getCachedWiki(owner, repo);
  if (!wiki) {
    return NextResponse.json({ error: "Wiki not found" }, { status: 404 });
  }

  const features = await getCachedFeatures(wiki.id);
  return NextResponse.json(
    { wiki, features },
    {
      ...(features.length && {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300",
        },
      }),
    },
  );
}
