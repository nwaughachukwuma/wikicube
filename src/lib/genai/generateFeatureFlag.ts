/* ─── Phase D: Generate wiki page per feature ─── */

import { z } from "zod";
import { getGemini, MODEL, parseJsonResponse } from "./utils";
import type {
  Citation,
  EntryPoint,
  GeneratedPage,
  IdentifiedFeature,
} from "../types";
import { logger } from "../logger";
import { buildGitHubUrl } from "../github";

const log = logger("gemini:featureFlag");

const GeneratedPageSchema = z.object({
  markdownContent: z.string(),
  entryPoints: z.array(
    z.object({
      file: z.string(),
      line: z.number(),
      symbol: z.string(),
      githubUrl: z.string(),
    }),
  ),
  citations: z.array(
    z.object({
      file: z.string(),
      startLine: z.number(),
      endLine: z.number(),
      githubUrl: z.string(),
    }),
  ),
});

const GeneratedPageResponseSchema = {
  type: "object",
  properties: {
    markdownContent: { type: "string" },
    entryPoints: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file: { type: "string" },
          line: { type: "number" },
          symbol: { type: "string" },
          githubUrl: { type: "string" },
        },
        required: ["file", "line", "symbol", "githubUrl"],
      },
    },
    citations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file: { type: "string" },
          startLine: { type: "number" },
          endLine: { type: "number" },
          githubUrl: { type: "string" },
        },
        required: ["file", "startLine", "endLine", "githubUrl"],
      },
    },
  },
  required: ["markdownContent", "entryPoints", "citations"],
} as const;

/** Truncate file content intelligently — keep head, tail, and signatures from middle */
function truncateFile(content: string, maxLines = 1024): string {
  const lines = content.split("\n");
  if (lines.length <= maxLines) return content;

  const headSize = Math.floor(maxLines * 0.6); // ~60% head
  const tailSize = Math.floor(maxLines * 0.15); // ~15% tail
  const sigBudget = maxLines - headSize - tailSize; // ~25% signatures

  const head = lines.slice(0, headSize);
  const tail = lines.slice(-tailSize);
  const middle = lines.slice(headSize, -tailSize);

  // Extract function/class/export signatures from middle
  const sigPatterns =
    /^(export |public |private |protected |async |def |fn |func |class |interface |type |const |let |var |function |module |impl |struct |enum )/;
  const signatures = middle
    .filter((line) => sigPatterns.test(line.trim()))
    .slice(0, sigBudget);

  return [
    ...head,
    `\n// ... ${middle.length} lines omitted — key signatures below ...\n`,
    ...signatures,
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
  // Build file context string with truncation for large files
  const fileContext = Array.from(fileContents.entries())
    .map(([path, content]) => `--- ${path} ---\n${truncateFile(content)}`)
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

  const done = log.time(`generateFeaturePage:${feature.title}`);
  const res = await getGemini().models.generateContent({
    model: MODEL,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseJsonSchema: GeneratedPageResponseSchema,
    },
  });

  const parsed = GeneratedPageSchema.parse(
    parseJsonResponse<unknown>(res.text, `feature page ${feature.title}`),
  );

  done({ feature: feature.title, model: MODEL });
  const {
    markdownContent,
    entryPoints: rawEPs,
    citations: rawCitations,
  } = parsed;

  // Back-fill githubUrls if the model omitted them
  const entryPoints: EntryPoint[] = rawEPs.map((ep) => ({
    ...ep,
    githubUrl:
      ep.githubUrl || buildGitHubUrl(owner, repo, branch, ep.file, ep.line),
  }));

  const citations: Citation[] = rawCitations.map((c) => ({
    ...c,
    githubUrl:
      c.githubUrl ||
      buildGitHubUrl(owner, repo, branch, c.file, c.startLine, c.endLine),
  }));

  return { markdownContent, entryPoints, citations };
}
