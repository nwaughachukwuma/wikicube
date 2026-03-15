import { NextRequest, NextResponse } from "next/server";
import { getWiki, getFeatures, getChallengesByWikiId, insertChallenges } from "@/lib/db";
import { getRecentIssues, getRecentPullRequests } from "@/lib/github";
import { generateChallenges } from "@/lib/genai/generateChallenges";
import { getSupabaseUser } from "@/lib/supabase/server";
import { privateWikiGuard } from "@/lib/db.utils";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;
  const wiki = await getWiki(owner, repo);
  if (!wiki) {
    return NextResponse.json({ error: "Wiki not found" }, { status: 404 });
  }

  if (wiki.visibility === "private") {
    const user = await getSupabaseUser();
    const error = privateWikiGuard(wiki, user?.id);
    if (error) return error;
  }

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

  if (wiki.visibility === "private") {
    const user = await getSupabaseUser();
    const error = privateWikiGuard(wiki, user?.id);
    if (error) return error;
  }

  // Check if challenges already exist
  const existing = await getChallengesByWikiId(wiki.id);
  if (existing.length > 0) {
    return NextResponse.json({ challenges: existing, wiki_id: wiki.id });
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
