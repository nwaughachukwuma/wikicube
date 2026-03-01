import type { RepoMeta, TreeEntry } from "./types";
import { logger } from "./logger";
import { batchAll } from "./batchOps";

const log = logger("github");
const GITHUB_API = "https://api.github.com";

const headers = (token?: string): HeadersInit =>
  ({
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "wikicube/1.0",
    Authorization: `Bearer ${token ?? process.env.GITHUB_TOKEN}`,
  }) satisfies HeadersInit;

// Detection
export const GITHUB_URL_RE =
  /^https?:\/\/(www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\/.*)?$/;

// Extraction
export const GITHUB_REPO_RE =
  /(?:github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;

/** Parse "owner/repo" from a GitHub URL */
export function parseRepoUrl(url: string): { owner: string; repo: string } {
  // handles: https://github.com/owner/repo, github.com/owner/repo, owner/repo
  const cleaned = url
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
  const match = cleaned.match(GITHUB_REPO_RE);
  if (!match) throw new Error(`Invalid GitHub URL: ${url}`);
  return { owner: match[1], repo: match[2] };
}

/** Fetch repo metadata */
export async function getRepoMeta(
  owner: string,
  repo: string,
  token?: string,
): Promise<RepoMeta> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
    headers: headers(token),
  });
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return {
    owner,
    repo,
    defaultBranch: data.default_branch,
    description: data.description || "",
    homepage: data.homepage || null,
    topics: data.topics || [],
    isPrivate: data.private ?? false,
  } satisfies RepoMeta;
}

/** Fetch full file tree */
export async function getRepoTree(
  owner: string,
  repo: string,
  branch: string,
  token?: string,
): Promise<TreeEntry[]> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: headers(token) },
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch tree: ${res.status}`);
  }

  const data = await res.json();
  if (data.truncated) {
    log.warn("tree truncated by GitHub API", { owner, repo, branch });
  }
  return (
    data.tree as Array<object & { path: string; type: string; size?: number }>
  ).map(
    (e) =>
      ({
        path: e.path,
        type: e.type as "blob" | "tree",
        size: e.size,
      }) satisfies TreeEntry,
  );
}

/** Fetch raw file content. For private repos pass the user's GitHub token. */
export async function getFileContent(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  token?: string,
) {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  const res = await fetch(
    url,
    token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  );
  const content = res.ok ? await res.text() : ""; // silently skip missing files
  return { content, path };
}

/** Fetch multiple files with concurrency limit */
export async function getMultipleFiles(
  owner: string,
  repo: string,
  branch: string,
  paths: string[],
  concurrency = 10,
  token?: string,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const queue = [...paths];

  async function worker() {
    while (queue.length > 0) {
      const path = queue.shift()!;
      const res = await getFileContent(owner, repo, branch, path, token);
      if (res.content) results.set(path, res.content);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, paths.length) },
    worker,
  );
  await Promise.all(workers);
  return results;
}

/** Build a GitHub URL to a specific file + line range */
export function buildGitHubUrl(
  owner: string,
  repo: string,
  branch: string,
  file: string,
  startLine?: number,
  endLine?: number,
): string {
  let url = `https://github.com/${owner}/${repo}/blob/${branch}/${file}`;
  if (startLine) {
    url += `#L${startLine}`;
    if (endLine && endLine !== startLine) url += `-L${endLine}`;
  }
  return url;
}

/* ─── Filtering ─── */

const IGNORED_PATTERNS = [
  /^node_modules\//,
  /^vendor\//,
  /^\.git\//,
  /^dist\//,
  /^build\//,
  /^out\//,
  /^\.next\//,
  /^__pycache__\//,
  /\.pyc$/,
  /^\.venv\//,
  /^venv\//,
  /^\.env/,
  /^coverage\//,
  /^target\//,
  /\.lock$/,
  /package-lock\.json$/,
  /\.min\.(js|css)$/,
  /\.map$/,
  /\.(png|jpg|jpeg|gif|svg|ico|webp|mp4|mp3|woff2?|ttf|eot|otf|zip|tar|gz|pdf)$/i,
  /^\.DS_Store$/,
  /^\.idea\//,
  /^\.vscode\//,
  /^\.husky\//,
  /^test(s)?\/fixtures?\//,
  /^__tests__\/snapshots?\//,
  /^\.github\/workflows\//,
  /^migrations?\//,
];

/** Filter tree to relevant source files only */
export function filterTree(entries: TreeEntry[]): TreeEntry[] {
  return entries.filter((e) => {
    if (e.type !== "blob") return false;
    return !IGNORED_PATTERNS.some((p) => p.test(e.path));
  });
}

/** Format tree paths as a compact string for LLM context */
export function formatTreeString(entries: TreeEntry[]): string {
  return entries.map((e) => e.path).join("\n");
}

/** Detect and fetch manifest files for project description */
const MANIFEST_FILES = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "Gemfile",
  "composer.json",
  "setup.py",
  "setup.cfg",
  "Package.swift",
  "CMakeLists.txt",
  "pubspec.yaml",
  "mix.exs",
  "build.gradle",
  "package.yaml",
];

const README_FILES = [
  "README.md",
  "README.rst",
  "README.txt",
  "README",
  "readme.md",
  "README.mdx",
  "CHANGELOG.md",
  "docs/intro.md",
  "mkdocs.yml",
  "docs/README.md",
  "docs/index.md",
  "CONTRIBUTING.md",
];

export async function fetchProjectContext(
  owner: string,
  repo: string,
  branch: string,
  treePaths: string[],
  token?: string,
): Promise<{ readme: string; manifests: string }> {
  const treePathSet = new Set(treePaths.map((p) => p.toLowerCase()));
  const readmePath = README_FILES.find((r) => treePathSet.has(r.toLowerCase()));
  const manifestPaths = MANIFEST_FILES.filter((m) =>
    treePathSet.has(m.toLowerCase()),
  ); //.slice(0, 3);

  // Fetch README + all manifests in parallel
  const [readmeResult, ...manifestResults] = await batchAll(
    [...(readmePath ? [readmePath] : []), ...manifestPaths],
    async (path) => getFileContent(owner, repo, branch, path, token),
    10,
  );

  const manifestContents = manifestResults
    .filter((res): res is { content: string; path: string } => !!res.content)
    .map((v) => `--- ${v.path} ---\n${v.content}`); //.slice(0, 2000)}`;

  return {
    readme: readmeResult.content, //.slice(0, 8000),
    manifests: manifestContents.join("\n\n"),
  };
}
