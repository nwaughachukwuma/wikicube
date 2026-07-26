import type { Wiki } from "@shared/types";

export const PUBLIC_WIKI_OWNER = "marcelroed";
export const PUBLIC_WIKI_REPO = "gigatoken";
export const PUBLIC_WIKI_OVERVIEW =
  "# Gigatoken\n\nA **fast** tokenizer for large datasets.";

export const PRIVATE_WIKI_OWNER = "nwaughachukwuma";
export const PRIVATE_WIKI_REPO = "private-wikicube-e2e";
export const PRIVATE_WIKI_OVERVIEW =
  "This private overview must never appear in page metadata.";

export function makeWiki(
  owner: string,
  repo: string,
  overview: string,
  visibility: "public" | "private",
): Wiki {
  return {
    id: `wiki-${owner}-${repo}`,
    owner,
    repo,
    default_branch: "main",
    overview,
    status: "done",
    visibility,
    indexed_by: visibility === "private" ? "user-1" : null,
    search_ready: true,
    search_error: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };
}

export const publicWiki = makeWiki(
  PUBLIC_WIKI_OWNER,
  PUBLIC_WIKI_REPO,
  PUBLIC_WIKI_OVERVIEW,
  "public",
);

export const privateWiki = makeWiki(
  PRIVATE_WIKI_OWNER,
  PRIVATE_WIKI_REPO,
  PRIVATE_WIKI_OVERVIEW,
  "private",
);
