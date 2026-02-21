import type { RepoMeta, TreeEntry } from "./types";

const GITHUB_API = "https://api.github.com";

function headers(): HeadersInit {
  const h: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "cubic-wiki-generator",
  };
  if (process.env.GITHUB_TOKEN) {
    h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return h;
}

/** Parse "owner/repo" from a GitHub URL */
export function parseRepoUrl(url: string): { owner: string; repo: string } {
  // handles: https://github.com/owner/repo, github.com/owner/repo, owner/repo
  const cleaned = url
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
  const match = cleaned.match(
    /(?:github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/,
  );
  if (!match) throw new Error(`Invalid GitHub URL: ${url}`);
  return { owner: match[1], repo: match[2] };
}

/** Fetch repo metadata */
export async function getRepoMeta(
  owner: string,
  repo: string,
): Promise<RepoMeta> {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
    headers: headers(),
  });
  if (!res.ok)
    throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return {
    owner,
    repo,
    defaultBranch: data.default_branch,
    description: data.description || "",
    homepage: data.homepage || null,
    topics: data.topics || [],
  };
}

/** Fetch full file tree */
export async function getRepoTree(
  owner: string,
  repo: string,
  branch: string,
): Promise<TreeEntry[]> {
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: headers() },
  );
  if (!res.ok) throw new Error(`Failed to fetch tree: ${res.status}`);
  const data = await res.json();
  if (data.truncated) {
    console.warn("Tree was truncated by GitHub API — very large repo");
  }
  return (
    data.tree as Array<{ path: string; type: string; size?: number }>
  ).map((e) => ({
    path: e.path,
    type: e.type as "blob" | "tree",
    size: e.size,
  }));
}

/** Fetch raw file content via raw.githubusercontent.com (no API rate limit) */
export async function getFileContent(
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<string> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  const res = await fetch(url);
  if (!res.ok) return ""; // silently skip missing files
  return res.text();
}

/** Fetch multiple files with concurrency limit */
export async function getMultipleFiles(
  owner: string,
  repo: string,
  branch: string,
  paths: string[],
  concurrency = 10,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const queue = [...paths];

  async function worker() {
    while (queue.length > 0) {
      const path = queue.shift()!;
      const content = await getFileContent(owner, repo, branch, path);
      if (content) results.set(path, content);
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
  /^\.github\/workflows\//,
  /^test(s)?\/fixtures?\//,
  /^__tests__\/snapshots?\//,
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
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "Gemfile",
  "composer.json",
  "setup.py",
  "setup.cfg",
];

const README_FILES = [
  "README.md",
  "README.rst",
  "README.txt",
  "README",
  "readme.md",
  "docs/README.md",
  "docs/index.md",
  "CONTRIBUTING.md",
];

export async function fetchProjectContext(
  owner: string,
  repo: string,
  branch: string,
  treePaths: string[],
): Promise<{ readme: string; manifests: string }> {
  // Find README
  const readmePath = README_FILES.find((r) =>
    treePaths.some((p) => p.toLowerCase() === r.toLowerCase()),
  );
  const readmeContent = readmePath
    ? await getFileContent(owner, repo, branch, readmePath)
    : "";

  // Find manifests
  const manifestPaths = MANIFEST_FILES.filter((m) =>
    treePaths.some((p) => p === m),
  );
  const manifestContents: string[] = [];
  for (const mp of manifestPaths.slice(0, 3)) {
    const content = await getFileContent(owner, repo, branch, mp);
    if (content) {
      // Truncate manifests to avoid bloat (just need name/description/deps)
      const truncated = content.slice(0, 2000);
      manifestContents.push(`--- ${mp} ---\n${truncated}`);
    }
  }

  return {
    readme: readmeContent.slice(0, 8000), // cap README to ~2k tokens
    manifests: manifestContents.join("\n\n"),
  };
}
