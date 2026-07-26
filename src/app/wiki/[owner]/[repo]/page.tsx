import type { Metadata } from "next";
import { getWiki } from "@/lib/db";
import { buildWikiMetadata } from "@/lib/wikiMetadata";
import OverviewPage from "./OverviewPage";
import type { Wiki } from "@shared/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
  const { owner, repo } = await params;

  let wiki: Wiki | null = null;
  try {
    wiki = await getWiki(owner, repo);
  } catch {}

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
