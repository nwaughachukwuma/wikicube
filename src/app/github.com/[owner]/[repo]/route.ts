import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;
  return NextResponse.redirect(
    new URL(`/wiki/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, request.url),
  );
}
