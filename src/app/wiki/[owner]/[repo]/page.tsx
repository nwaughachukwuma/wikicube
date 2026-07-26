import type { Metadata } from "next";
import { getWiki } from "@/lib/db";
import { buildWikiMetadata } from "@/lib/wikiMetadata";
import OverviewPage from "./OverviewPage";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
  const { owner, repo } = await params;

  let wiki = null;
  try {
    wiki = await getWiki(owner, repo);
  } catch {
    // Fall through to generic metadata if the wiki lookup fails.
  }

  return buildWikiMetadata({
    owner,
    repo,
    overview: wiki?.overview,
    visibility: wiki?.visibility ?? null,
  });
}

export default async function WikiOverviewRoute({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;
  return <OverviewPage owner={owner} repo={repo} />;
}
