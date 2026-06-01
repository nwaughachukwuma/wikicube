import { NextRequest, NextResponse } from "next/server";
import { getWiki, getChallengesByWikiId } from "@/lib/db";
import { generateAndStoreChallenges } from "@/lib/challenges";
import { validateRepoAccess } from "@/lib/db.utils";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;
  const wiki = await getWiki(owner, repo);
  if (!wiki) {
    return NextResponse.json({ error: "Wiki not found" }, { status: 404 });
  }

  const error = await validateRepoAccess(owner, repo);
  if (error) return error;

  const challenges = await getChallengesByWikiId(wiki.id);
  return NextResponse.json({ challenges, wiki_id: wiki.id });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;
  const wiki = await getWiki(owner, repo);
  if (!wiki || wiki.status !== "done") {
    return NextResponse.json(
      { error: "Wiki not found or not ready" },
      { status: 404 },
    );
  }

  const error = await validateRepoAccess(owner, repo);
  if (error) return error;

  // Check if challenges already exist
  const existing = await getChallengesByWikiId(wiki.id);
  if (existing.length > 0) {
    return NextResponse.json({
      challenges: existing,
      wiki_id: wiki.id,
    });
  }

  const challenges = await generateAndStoreChallenges(wiki, owner, repo);
  return NextResponse.json({ challenges, wiki_id: wiki.id });
}
