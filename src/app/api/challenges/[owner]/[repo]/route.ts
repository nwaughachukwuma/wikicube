import { NextRequest, NextResponse } from "next/server";
import {
  getWiki,
  getFeatures,
  getChallengesByWikiId,
  insertChallenges,
  deleteChallenges,
} from "@/lib/db";
import { getRecentIssues, getRecentPullRequests } from "@shared/github";
import { generateChallenges } from "@shared/genai/generate-challenges";
import { validateRepoAccess } from "@/lib/db.utils";
import type { Challenge } from "@shared/types";

// Keep at most this many challenges per wiki; "Fetch new" trims the oldest.
const MAX_CHALLENGES = 25;

// Two challenges are considered duplicates when their objective + task match.
const dedupeKey = (c: Pick<Challenge, "objective" | "task">) =>
  `${c.objective}\n${c.task}`.trim().toLowerCase();

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

  const existing = await getChallengesByWikiId(wiki.id);

  // Reuse existing challenges unless a refresh was explicitly requested
  if (!refresh && existing.length > 0) {
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

  // First-time generation: nothing to consolidate against.
  if (existing.length === 0) {
    const challenges = await insertChallenges(toRows(wiki.id, generated));
    return NextResponse.json({ challenges, wiki_id: wiki.id });
  }

  // Refresh: insert only genuinely new challenges, then consolidate the full
  // set — dedupe and cap at MAX_CHALLENGES (keeping the most recent).
  const existingKeys = new Set(existing.map(dedupeKey));
  const freshSeen = new Set<string>();
  const freshUnique = generated.filter((c) => {
    const key = dedupeKey(c);
    if (existingKeys.has(key) || freshSeen.has(key)) return false;
    freshSeen.add(key);
    return true;
  });
  const inserted = freshUnique.length
    ? await insertChallenges(toRows(wiki.id, freshUnique))
    : [];

  // Newest first: just-generated, then existing from newest to oldest.
  const merged = [...inserted, ...existing.slice().reverse()];
  const seen = new Set<string>();
  const kept: Challenge[] = [];
  const dropIds: string[] = [];
  for (const c of merged) {
    if (seen.has(dedupeKey(c)) || kept.length >= MAX_CHALLENGES) {
      dropIds.push(c.id);
      continue;
    }
    seen.add(dedupeKey(c));
    kept.push(c);
  }
  await deleteChallenges(dropIds);

  return NextResponse.json({ challenges: kept, wiki_id: wiki.id });
}

function toRows(
  wikiId: string,
  challenges: Array<Pick<Challenge, "role" | "background" | "objective" | "task" | "acceptance_criteria">>,
): Array<Omit<Challenge, "id" | "created_at">> {
  return challenges.map((c) => ({
    wiki_id: wikiId,
    role: c.role,
    background: c.background,
    objective: c.objective,
    task: c.task,
    acceptance_criteria: c.acceptance_criteria,
  }));
}
