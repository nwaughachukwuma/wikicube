import type { Metadata } from "next";

export interface BuildWikiMetadataParams {
  owner: string;
  repo: string;
  overview?: string;
  visibility?: "public" | "private" | null;
  siteUrl?: string;
}

const DEFAULT_SITE_URL = "https://wikicube.vercel.app";

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

export function buildWikiMetadata({
  owner,
  repo,
  overview,
  visibility,
  siteUrl = DEFAULT_SITE_URL,
}: BuildWikiMetadataParams): Metadata {
  const url = `${siteUrl}/wiki/${owner}/${repo}`;
  const title = `${owner}/${repo} · WikiCube`;
  const genericDescription = `AI-generated wiki for ${owner}/${repo}`;

  const isPublic = visibility === "public";
  let description = genericDescription;

  if (isPublic && overview) {
    const overviewText = stripMarkdown(overview);
    description = `${overviewText.slice(0, 155).trimEnd()}${overviewText.length > 155 ? "…" : ""}`;
  }

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
