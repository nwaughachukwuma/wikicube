import type { Metadata } from "next";
import { getWiki } from "@/lib/db";
import OverviewPage from "./OverviewPage";

const SITE_URL = "https://wikicube.vercel.app";

function stripMarkdown(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~|]/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
  const { owner, repo } = await params;

  let overviewText = "";
  try {
    const wiki = await getWiki(owner, repo);
    if (wiki?.overview) {
      overviewText = stripMarkdown(wiki.overview);
    }
  } catch {
    // Leave overviewText empty to fall back to default description.
  }

  const title = `${owner}/${repo} · WikiCube`;
  const description = overviewText
    ? `${overviewText.slice(0, 155).trimEnd()}${overviewText.length > 155 ? "…" : ""}`
    : `AI-generated wiki for ${owner}/${repo}`;
  const url = `${SITE_URL}/wiki/${owner}/${repo}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function WikiOverviewRoute({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;
  return <OverviewPage owner={owner} repo={repo} />;
}
