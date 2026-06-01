import { NextRequest, NextResponse } from "next/server";
import {
  getWiki,
  getFeatures,
  getChallengesByWikiId,
  insertChallenges,
} from "@/lib/db";
import { getRecentIssues, getRecentPullRequests } from "@shared/github";
import { generateChallenges } from "@shared/genai/generate-challenges";
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
  req: NextRequest,
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

  // `refresh=true` forces a fresh batch even when challenges already exist
  const refresh = req.nextUrl.searchParams.get("refresh") === "true";

  // Reuse existing challenges unless a refresh was explicitly requested
  if (!refresh) {
    const existing = await getChallengesByWikiId(wiki.id);
    if (existing.length > 0) {
      return NextResponse.json({
        challenges: existing,
        wiki_id: wiki.id,
      });
    }
  }

  // Gather context
  const features = await getFeatures(wiki.id);
  const [issues, pullRequests] = await Promise.all([
    getRecentIssues(owner, repo),
    getRecentPullRequests(owner, repo),
  ]);

  // Generate challenges
  const generated = await generateChallenges({
    owner,
    repo,
    overview: wiki.overview,
    features: features.map((f) => ({
      title: f.title,
      summary: f.summary,
      markdown_content: f.markdown_content,
    })),
    issues,
    pullRequests,
  });

  // Store in database
  const challenges = await insertChallenges(
    generated.map((c) => ({
      wiki_id: wiki.id,
      role: c.role,
      background: c.background,
      objective: c.objective,
      task: c.task,
      acceptance_criteria: c.acceptance_criteria,
    })),
  );

  return NextResponse.json({ challenges, wiki_id: wiki.id });
}
