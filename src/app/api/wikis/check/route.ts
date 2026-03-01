import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerClient } from "@/lib/supabase/server";

interface CheckResult {
  owner: string;
  repo: string;
  hasWiki: boolean;
}

const RepoRefSchema = z.object({
  repos: z.array(
    z.object({
      owner: z.string().nonempty(),
      repo: z.string().nonempty(),
    }),
  ),
});

/**
 * POST /api/wikis/check
 * Body: { repos: Array<{ owner: string; repo: string }> }
 * Returns: Array<{ owner, repo, hasWiki }>
 *
 * Only queries wikis that match the exact set of repos provided — O(n)
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const parseResult = RepoRefSchema.safeParse(await req.json());
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parseResult.error.errors },
      { status: 400 },
    );
  }

  const { repos } = parseResult.data;
  if (!Array.isArray(repos) || repos.length === 0) {
    return NextResponse.json([]);
  }

  // Build a PostgREST `or` filter: or(and(owner.eq.x,repo.eq.y),...)
  const orFilter = repos
    .map(({ owner, repo }) => `and(owner.eq."${owner}",repo.eq."${repo}")`)
    .join(",");

  const db = getServerClient();
  const { data, error } = await db
    .from("wikis")
    .select("owner, repo")
    .eq("status", "done")
    .or(orFilter);

  if (error) throw error;

  const found = new Set(
    (data ?? []).map((w) => `${w.owner}/${w.repo}`.toLowerCase()),
  );

  const results: CheckResult[] = repos.map(({ owner, repo }) => ({
    owner,
    repo,
    hasWiki: found.has(`${owner}/${repo}`.toLowerCase()),
  }));

  return NextResponse.json(results);
}
