import { NextResponse } from "next/server";
import { getServerClient, getSupabaseSession } from "@/lib/supabase/server";

interface GitHubRepo {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
  description: string | null;
  private: boolean;
  updated_at: string;
  stargazers_count: number;
  language: string | null;
}

export interface RepoWithWiki extends GitHubRepo {
  hasWiki: boolean;
}

export async function GET(): Promise<NextResponse> {
  // Read providerToken from the session cookie — never touches the client network
  const session = await getSupabaseSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const providerToken = session.provider_token;
  if (!providerToken) {
    return NextResponse.json(
      { error: "No GitHub token. Please re-authenticate." },
      { status: 403 },
    );
  }

  // 1. Fetch all user repos (public + private) from GitHub
  const ghRes = await fetch(
    "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member&visibility=all",
    {
      headers: {
        Authorization: `Bearer ${providerToken}`,
        Accept: "application/vnd.github.v3+json",
      },
      next: { revalidate: 0 }, // we handle caching client-side via fetchWithSWR
    },
  );

  if (!ghRes.ok) {
    return NextResponse.json(
      { error: `GitHub API error: ${ghRes.status}` },
      { status: 502 },
    );
  }

  const allRepos: GitHubRepo[] = await ghRes.json();
  if (allRepos.length === 0) {
    return NextResponse.json([]);
  }

  // 2. Check wikis for exactly this set of repos — parallel with nothing else to wait on
  const orFilter = allRepos
    .map(
      ({ owner, name }) => `and(owner.eq."${owner.login}",repo.eq."${name}")`,
    )
    .join(",");

  const { data: wikiRows } = await getServerClient()
    .from("wikis")
    .select("owner, repo")
    .eq("status", "done")
    .or(orFilter);

  const wikiSet = new Set(
    (wikiRows ?? []).map((w) => `${w.owner}/${w.repo}`.toLowerCase()),
  );

  const result: RepoWithWiki[] = allRepos.map((repo) => ({
    ...repo,
    hasWiki: wikiSet.has(`${repo.owner.login}/${repo.name}`.toLowerCase()),
  }));

  return NextResponse.json(result, {
    headers: {
      // Allow the client-side fetchWithSWR cache to be busted on hard refresh
      "Cache-Control": "private, no-store",
    },
  });
}
