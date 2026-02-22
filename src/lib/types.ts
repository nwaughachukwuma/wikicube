/* ─── Wiki data model ─── */

export interface Wiki {
  id: string;
  owner: string;
  repo: string;
  default_branch: string;
  overview: string;
  status: WikiStatus;
  created_at: string;
  updated_at: string;
}

export type WikiStatus =
  | "pending"
  | "fetching_tree"
  | "identifying_features"
  | "generating_pages"
  | "embedding"
  | "done"
  | "error";

export interface Feature {
  id: string;
  wiki_id: string;
  slug: string;
  title: string;
  summary: string;
  markdown_content: string;
  entry_points: EntryPoint[];
  citations: Citation[];
  sort_order: number;
}

export interface Citation {
  file: string;
  startLine: number;
  endLine: number;
  githubUrl: string;
}

export interface EntryPoint {
  file: string;
  line: number;
  symbol: string;
  githubUrl: string;
}

export interface Chunk {
  id: string;
  wiki_id: string;
  feature_id: string | null;
  content: string;
  source_type: "wiki" | "code";
  source_file: string | null;
  embedding: number[];
}

/* ─── LLM response shapes ─── */

export interface IdentifiedFeature {
  id: string;
  title: string;
  summary: string;
  relevantFiles: string[];
}

export interface GeneratedPage {
  markdownContent: string;
  entryPoints: EntryPoint[];
  citations: Citation[];
}

/* ─── GitHub types ─── */

export interface RepoMeta {
  owner: string;
  repo: string;
  defaultBranch: string;
  description: string;
  homepage: string | null;
  topics: string[];
}

export interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

/* ─── SSE event types ─── */

export type AnalysisEvent =
  | { type: "status"; status: WikiStatus; message: string }
  | { type: "features_list"; features: string[] }
  | { type: "feature_started"; featureTitle: string }
  | { type: "feature_done"; featureTitle: string }
  | { type: "done"; wikiId: string }
  | { type: "error"; message: string };
