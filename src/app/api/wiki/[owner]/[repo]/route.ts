import { NextRequest, NextResponse } from "next/server";
import { getWiki, getFeatures } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  try {
    const { owner, repo } = await params;
    const wiki = await getWiki(owner, repo);

    if (!wiki) {
      return NextResponse.json({ error: "Wiki not found" }, { status: 404 });
    }

    const features = await getFeatures(wiki.id);

    return NextResponse.json({ wiki, features });
  } catch (err) {
    console.error("Wiki API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
