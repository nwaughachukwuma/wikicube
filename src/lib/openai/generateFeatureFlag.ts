/* ─── Phase D: Generate wiki page per feature ─── */

import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { getOpenAI, MODEL } from "./utils";
import type {
  Citation,
  EntryPoint,
  GeneratedPage,
  IdentifiedFeature,
} from "../types";
import { logger } from "../logger";
import { buildGitHubUrl } from "../github";

const log = logger("openai:featureFlag");

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

/** Truncate file content intelligently — keep signatures and structure */
// function truncateFile(content: string, maxLines = 300): string {
//   const lines = content.split("\n");
//   if (lines.length <= maxLines) return content;

//   // Take first 100 lines, last 30 lines, and extract signatures from middle
//   const head = lines.slice(0, 100);
//   const tail = lines.slice(-30);
//   const middle = lines.slice(100, -30);

//   // Extract function/class/export signatures from middle
//   const sigPatterns =
//     /^(export |public |private |protected |async |def |fn |func |class |interface |type |const |let |var |function |module |impl |struct |enum )/;
//   const signatures = middle.filter((line) => sigPatterns.test(line.trim()));

//   return [
//     ...head,
//     `\n// ... ${middle.length} lines omitted — key signatures below ...\n`,
//     ...signatures.slice(0, 50),
//     "\n// ... end of middle section ...\n",
//     ...tail,
//   ].join("\n");
// }

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
      // const truncated = truncateFile(content);
      return `--- ${path} ---\n${content}`;
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

  const done = log.time(`generateFeaturePage:${feature.title}`);
  const res = await openai.responses.parse({
    model: MODEL,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    text: { format: zodTextFormat(GeneratedPageSchema, "wiki_page") },
  });

  if (!res.output_parsed)
    throw new Error(`No response for feature: ${feature.title}`);
  done({ feature: feature.title, model: MODEL });

  const {
    markdownContent,
    entryPoints: rawEPs,
    citations: rawCitations,
  } = res.output_parsed;

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
