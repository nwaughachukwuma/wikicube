import { NextRequest, NextResponse } from "next/server";
import { getWiki, recordLatestCommit } from "@/lib/db";
import { getSupabaseSession } from "@/lib/supabase/server";
import { getBranchHeadSha, hasCommitsSince } from "@shared/github";

/**
 * Whether a private wiki is behind its repo. Checked live with the viewer's
 * GitHub token, since the scheduled check can't read private repos.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;
  const wiki = await getWiki(owner, repo);
  if (!wiki || wiki.status !== "done") {
    return NextResponse.json({ error: "Wiki not found" }, { status: 404 });
  }
  if (wiki.visibility !== "private") {
    return NextResponse.json(
      { error: "Public wikis are checked on a schedule" },
      { status: 400 },
    );
  }

  const token = (await getSupabaseSession())?.provider_token;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Reading HEAD with the viewer's token also confirms they can read the repo
  const branch = wiki.default_branch;
  const latestSha = await getBranchHeadSha(owner, repo, branch, token).catch(
    () => null,
  );
  if (!latestSha) {
    return NextResponse.json(
      { error: "You do not have access to this wiki" },
      { status: 403 },
    );
  }

  const stale = wiki.source_commit_sha
    ? wiki.source_commit_sha !== latestSha
    : // generated before commits were recorded
      await hasCommitsSince(
        owner,
        repo,
        branch,
        wiki.generated_at ?? wiki.updated_at,
        token,
      ).catch(() => false);

  if (latestSha !== wiki.latest_commit_sha) {
    await recordLatestCommit(wiki.id, latestSha);
  }

  return NextResponse.json(
    {
      stale,
      refreshing: !!wiki.refresh_started_at,
      refreshError: wiki.refresh_error,
      sourceSha: wiki.source_commit_sha,
      latestSha,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
