import OpenAI from "openai";
import type {
  IdentifiedFeature,
  GeneratedPage,
  EntryPoint,
  Citation,
} from "./types";
import { buildGitHubUrl } from "./github";

const MODEL = "gpt-5-mini";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

/* ─── Phase B: Identify features from file tree ─── */

export async function identifyFeatures(
  repoName: string,
  treeString: string,
  readme: string,
  manifests: string,
  repoDescription: string,
): Promise<IdentifiedFeature[]> {
  const openai = getOpenAI();

  const systemPrompt = `You are a senior technical writer analyzing a GitHub repository to create user-facing documentation.

Given a repository's file tree, README, and metadata, identify ALL high-level user-facing features and subsystems.

IMPORTANT:
- Think about what the software DOES for users, not how it's technically organized
- BAD examples: "Utils", "API layer", "Frontend", "Backend", "Config", "Types"
- GOOD examples: "User Authentication", "Real-time Notifications", "Data Export", "Search & Filtering"
- Be exhaustive — identify every meaningful feature, not just the obvious ones
- For each feature, list ALL specific file paths that implement it (routes, components, services, models, tests, configs)
- A file can belong to multiple features if relevant

Return ONLY valid JSON with this exact structure:
{
  "features": [
    {
      "id": "kebab-case-id",
      "title": "Human Readable Title",
      "summary": "2-3 sentence description of what this feature does for users",
      "relevantFiles": ["path/to/file1.ts", "path/to/file2.py"]
    }
  ]
}`;

  const userPrompt = `Repository: ${repoName}
Description: ${repoDescription || "Not provided"}

${manifests ? `Project manifests:\n${manifests}\n` : ""}
${readme ? `README:\n${readme}\n` : "No README found."}

File tree:
${treeString}`;

  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const content = res.choices[0]?.message?.content;
  if (!content)
    throw new Error("No response from OpenAI for feature identification");

  const parsed = JSON.parse(content);
  return parsed.features as IdentifiedFeature[];
}

/* ─── Phase D: Generate wiki page per feature ─── */

/** Truncate file content intelligently — keep signatures and structure */
function truncateFile(content: string, maxLines = 300): string {
  const lines = content.split("\n");
  if (lines.length <= maxLines) return content;

  // Take first 100 lines, last 30 lines, and extract signatures from middle
  const head = lines.slice(0, 100);
  const tail = lines.slice(-30);
  const middle = lines.slice(100, -30);

  // Extract function/class/export signatures from middle
  const sigPatterns =
    /^(export |public |private |protected |async |def |fn |func |class |interface |type |const |let |var |function |module |impl |struct |enum )/;
  const signatures = middle.filter((line) => sigPatterns.test(line.trim()));

  return [
    ...head,
    `\n// ... ${middle.length} lines omitted — key signatures below ...\n`,
    ...signatures.slice(0, 50),
    "\n// ... end of middle section ...\n",
    ...tail,
  ].join("\n");
}

export async function generateFeaturePage(
  repoName: string,
  owner: string,
  repo: string,
  branch: string,
  feature: IdentifiedFeature,
  fileContents: Map<string, string>,
): Promise<GeneratedPage> {
  const openai = getOpenAI();

  // Build file context string with truncation
  const fileContext = Array.from(fileContents.entries())
    .map(([path, content]) => {
      const truncated = truncateFile(content);
      return `--- ${path} ---\n${truncated}`;
    })
    .join("\n\n");

  const systemPrompt = `You are a senior technical writer creating wiki documentation for a GitHub repository.

Generate a comprehensive wiki page for the "${feature.title}" feature of ${repoName}.

Structure your response as:
1. **Overview** — What this feature does for users (2-3 paragraphs)
2. **How It Works** — User-facing explanation of the feature's behavior
3. **Technical Details** — Architecture, key modules, data flow, algorithms
4. **Configuration & Setup** — Any config files, env vars, or setup needed
5. **Key Entry Points** — Main functions/classes/routes that developers should know

CRITICAL RULES for citations:
- Every technical claim MUST reference specific code with inline citations
- Use this exact format: [filename#L42](https://github.com/${owner}/${repo}/blob/${branch}/filename#L42)
- Reference actual line numbers from the provided source code
- Be accurate — only cite lines that actually contain the referenced code

Return ONLY valid JSON:
{
  "markdownContent": "full markdown content with inline citations",
  "entryPoints": [
    { "file": "path/to/file.ts", "line": 42, "symbol": "functionName", "githubUrl": "full github url" }
  ],
  "citations": [
    { "file": "path/to/file.ts", "startLine": 42, "endLine": 50, "githubUrl": "full github url" }
  ]
}`;

  const userPrompt = `Feature: ${feature.title}
Summary: ${feature.summary}

Source files:
${fileContext}`;

  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });

  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error(`No response for feature: ${feature.title}`);

  const parsed = JSON.parse(content);

  // Ensure githubUrls are properly formed
  const entryPoints: EntryPoint[] = (parsed.entryPoints || []).map(
    (ep: Partial<EntryPoint>) => ({
      file: ep.file || "",
      line: ep.line || 0,
      symbol: ep.symbol || "",
      githubUrl:
        ep.githubUrl ||
        buildGitHubUrl(owner, repo, branch, ep.file || "", ep.line),
    }),
  );

  const citations: Citation[] = (parsed.citations || []).map(
    (c: Partial<Citation>) => ({
      file: c.file || "",
      startLine: c.startLine || 0,
      endLine: c.endLine || 0,
      githubUrl:
        c.githubUrl ||
        buildGitHubUrl(
          owner,
          repo,
          branch,
          c.file || "",
          c.startLine,
          c.endLine,
        ),
    }),
  );

  return {
    markdownContent: parsed.markdownContent || "",
    entryPoints,
    citations,
  };
}

/* ─── Phase E: Generate overview page ─── */

export async function generateOverview(
  repoName: string,
  repoDescription: string,
  readme: string,
  features: Array<{ title: string; summary: string }>,
): Promise<string> {
  const openai = getOpenAI();

  const featureList = features
    .map((f, i) => `${i + 1}. **${f.title}**: ${f.summary}`)
    .join("\n");

  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `You are a senior technical writer. Generate a concise overview page for a GitHub repository wiki.
Include:
1. A clear description of what the project does (from a user's perspective)
2. Key capabilities and use cases
3. Architecture overview (if discernible) — use a mermaid diagram if helpful
4. A summary of all features listed below

Write in markdown. Be concise but thorough. Do NOT wrap in a JSON object — return raw markdown only.`,
      },
      {
        role: "user",
        content: `Repository: ${repoName}
Description: ${repoDescription || "Not provided in repo metadata"}
${readme ? `\nREADME excerpt:\n${readme.slice(0, 3000)}` : ""}

Features identified:
${featureList}`,
      },
    ],
    temperature: 0.3,
  });

  return (
    res.choices[0]?.message?.content || "# Overview\n\nNo overview generated."
  );
}

/* ─── RAG: Chat with wiki ─── */

export async function chatWithWiki(
  question: string,
  contextChunks: string[],
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<ReadableStream<Uint8Array>> {
  const openai = getOpenAI();

  const context = contextChunks.join("\n\n---\n\n");

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are a helpful assistant answering questions about a codebase wiki.

Use ONLY the provided context to answer. If the context doesn't contain enough information, say so honestly.
Cite specific features, files, and line numbers when possible.
Be concise and accurate.

Context from the wiki and codebase:
${context}`,
    },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: question },
  ];

  const res = await openai.chat.completions.create({
    model: MODEL,
    messages,
    temperature: 0.4,
    stream: true,
  });

  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      for await (const chunk of res) {
        const text = chunk.choices[0]?.delta?.content || "";
        if (text) {
          controller.enqueue(encoder.encode(text));
        }
      }
      controller.close();
    },
  });
}

/* ─── Embeddings ─── */

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const openai = getOpenAI();
  const batchSize = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const res = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: batch,
      dimensions: 1536,
    });
    allEmbeddings.push(...res.data.map((d) => d.embedding));
  }

  return allEmbeddings;
}
