import { NextRequest, NextResponse } from "next/server";
import { getWiki } from "@/lib/db";
import { repoGuard, getBearerToken } from "@shared/github";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;
  const token = getBearerToken(req.headers);
  const access = await repoGuard(owner, repo, token)
    .then(() => true)
    .catch(() => false);

  if (!access) {
    return NextResponse.json(
      { error: "Repository not found or is private." },
      { status: 401 },
    );
  }
  const wiki = await getWiki(owner, repo);
  if (!wiki) {
    return NextResponse.json({ error: "Wiki not found" }, { status: 404 });
  }

  return NextResponse.json(
    { status: wiki.status },
    {
      ...(wiki.status === "done" && {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300",
        },
      }),
    },
  );
}
