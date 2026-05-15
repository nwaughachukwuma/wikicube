import { GoogleGenAI, type Content } from "@google/genai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { makeRetriable, type Options } from "p-retry";
import type { Citation, EntryPoint, GeneratedPage, IdentifiedFeature } from "../types.js";
import { logger } from "../lib/logger.js";
import { batchAll } from "../lib/batch-ops.js";
import { buildGitHubUrl } from "./github.js";

const logGemini = logger("gemini");

export const MODELS = {
  "g31flash-lite": "gemini-3.1-flash-lite-preview",
  g3flash: "gemini-3-flash-preview",
  g31pro: "gemini-3.1-pro-preview",
} as const;

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 1536;

export type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "QUESTION_ANSWERING";

let _client: GoogleGenAI | null = null;

export function getGemini() {
  return (_client ||= new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  }));
}

export function parseJsonResponse<T>(text: string | undefined, source: string): T {
  if (!text) throw new Error(`No response text from Gemini for ${source}`);
  const trimmed = text.trim();
  const normalized = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  return JSON.parse(normalized) as T;
}

export function toGeminiJsonSchema(schema: z.ZodTypeAny) {
  const jsonSchema = zodToJsonSchema(schema, { $refStrategy: "none" }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}

export function parseStructuredJson<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  text: string | undefined,
  source: string,
): z.infer<TSchema> {
  return schema.parse(parseJsonResponse<unknown>(text, source));
}

export const retryGenerateContent = (opt: Options) =>
  makeRetriable(getGemini().models.generateContent, {
    retries: opt.retries,
    onFailedAttempt: opt.onFailedAttempt,
  });

/* ─── Embeddings ─── */

const logEmbed = logger("gemini:embeddings");

const retryableEmbed = makeRetriable(getGemini().models.embedContent, {
  retries: 3,
  onFailedAttempt: (ctx) => {
    logEmbed.warn(
      `Embedding attempt ${ctx.attemptNumber} failed. Retries left: ${ctx.retriesLeft}. Error: ${ctx.error}`,
    );
  },
});

async function getEmbeddings(batch: string[], taskType: TaskType = "RETRIEVAL_DOCUMENT") {
  const res = await retryableEmbed({
    model: EMBEDDING_MODEL,
    contents: batch,
    config: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType },
  });
  if (!res.embeddings) throw new Error("No embeddings returned from Gemini");
  return res.embeddings.map((d) => d.values ?? []);
}

const BATCH_SIZE = 7;

export async function generateEmbeddings(
  texts: string[],
  taskType: TaskType = "RETRIEVAL_DOCUMENT",
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const batches: string[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push(texts.slice(i, i + BATCH_SIZE));
  }
  logEmbed.info("embedding started", { totalTexts: texts.length, batches: batches.length, batchSize: BATCH_SIZE });
  const results = await batchAll(batches, (b) => getEmbeddings(b, taskType), 5);
  return results.flat();
}

/* ─── Chat with Wiki ─── */

const logChat = logger("gemini:chatWithWiki");

export async function chatWithWiki(
  question: string,
  contextChunks: string[],
  history: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<ReadableStream<Uint8Array>> {
  const context = contextChunks.join("\n\n---\n\n");

  const chat = getGemini().chats.create({
    model: MODELS["g31flash-lite"],
    config: {
      systemInstruction: `You are a helpful assistant answering questions about a codebase wiki.

Use ONLY the provided context to answer. If the context doesn't contain enough information, say so honestly.
Cite specific features, files, and line numbers when possible.
Be concise and accurate.

Context from the wiki and codebase:
${context}`,
    },
    history: history.map<Content>((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
  });

  const chatStream = async (q: string) => chat.sendMessageStream({ message: q });

  const retryChat = makeRetriable(chatStream, {
    retries: 3,
    onFailedAttempt(ctx) {
      logChat.warn(
        `Chat sendMessageStream ${ctx.attemptNumber} failed. Retries left: ${ctx.retriesLeft}. Error: ${ctx.error}`,
      );
    },
  });

  const res = await retryChat(question);
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      for await (const chunk of res) {
        const text = chunk.text || "";
        if (text) controller.enqueue(encoder.encode(text));
      }
      controller.close();
    },
  });
}

/* ─── Identify Features ─── */

const logIdf = logger("gemini:identifyFeatures");

const IdentifyFeaturesSchema = z.object({
  features: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      summary: z.string(),
      relevantFiles: z.array(z.string()),
    }),
  ),
});

const retryableIdf = retryGenerateContent({
  retries: 3,
  onFailedAttempt(ctx) {
    logIdf.warn(
      `Identify features ${ctx.attemptNumber} failed. Retries left: ${ctx.retriesLeft}. Error: ${ctx.error}`,
    );
  },
});

export async function identifyFeatures(
  repo: string,
  treeString: string,
  readme: string,
  manifests: string,
  repoDescription: string,
): Promise<IdentifiedFeature[]> {
  const systemPrompt = `You are a senior technical writer analyzing a GitHub repository to create user-facing documentation.

Given a repository's README, file tree, and metadata, identify ALL high-level user-facing features and subsystems.

IMPORTANT:
- Think about what the software DOES for users, not how it's technically organized
- BAD examples: "Utils", "API layer", "Frontend", "Backend", "Config", "Types"
- GOOD examples: "User Authentication", "Real-time Notifications", "Data Export", "Search & Filtering", "Onboarding", "Payment Processing", "Installation & Setup", etc."
- Be exhaustive and complete — identify every meaningful feature, not just the obvious ones
- For each feature, list ALL specific and relevant file paths (using the file tree) that implement it
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

  const cappedReadme = readme.slice(0, 12_000);
  const cappedManifests = manifests.slice(0, 6_000);
  const cappedTree = treeString.slice(0, 8_000);

  const userPrompt = `Repository: ${repo}
Description: ${repoDescription || "Not provided"}

${cappedManifests ? `Project manifests:\n${cappedManifests}\n` : ""}
${cappedReadme ? `README:\n${cappedReadme}\n` : "No README found."}

File tree:
${cappedTree}`;

  const done = logIdf.time("identifyFeatures");
  const res = await retryableIdf({
    model: MODELS["g31pro"],
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseJsonSchema: toGeminiJsonSchema(IdentifyFeaturesSchema),
    },
  });

  const parsed = parseStructuredJson(IdentifyFeaturesSchema, res.text, "feature identification");
  done({ featureCount: parsed.features.length, model: MODELS["g31pro"] });
  return parsed.features as IdentifiedFeature[];
}

/* ─── Generate Feature Page ─── */

const logFeature = logger("gemini:featureFlag");

const GeneratedPageSchema = z.object({
  markdownContent: z.string(),
  entryPoints: z.array(
    z.object({ file: z.string(), line: z.number(), symbol: z.string(), githubUrl: z.string() }),
  ),
  citations: z.array(
    z.object({ file: z.string(), startLine: z.number(), endLine: z.number(), githubUrl: z.string() }),
  ),
});

function truncateFile(content: string, maxLines = 1024): string {
  const lines = content.split("\n");
  if (lines.length <= maxLines) return content;
  const headSize = Math.floor(maxLines * 0.6);
  const tailSize = Math.floor(maxLines * 0.15);
  const sigBudget = maxLines - headSize - tailSize;
  const head = lines.slice(0, headSize);
  const tail = lines.slice(-tailSize);
  const middle = lines.slice(headSize, -tailSize);
  const sigPatterns =
    /^(export |public |private |protected |async |def |fn |func |class |interface |type |const |let |var |function |module |impl |struct |enum )/;
  const signatures = middle.filter((line) => sigPatterns.test(line.trim())).slice(0, sigBudget);
  return [
    ...head,
    `\n// ... ${middle.length} lines omitted — key signatures below ...\n`,
    ...signatures,
    "\n// ... end of middle section ...\n",
    ...tail,
  ].join("\n");
}

const retryableFeature = retryGenerateContent({
  retries: 3,
  onFailedAttempt(ctx) {
    logFeature.warn(
      `Generate feature page ${ctx.attemptNumber} failed. Retries left: ${ctx.retriesLeft}. Error: ${ctx.error}`,
    );
  },
});

export async function generateFeaturePage(
  repoName: string,
  owner: string,
  repo: string,
  branch: string,
  feature: IdentifiedFeature,
  fileContents: Map<string, string>,
): Promise<GeneratedPage> {
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

  const userPrompt = `Feature: ${feature.title}\nSummary: ${feature.summary}\n\nSource files:\n${fileContext}`;

  const done = logFeature.time(`generateFeaturePage:${feature.title}`);
  const res = await retryableFeature({
    model: MODELS["g31flash-lite"],
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseJsonSchema: toGeminiJsonSchema(GeneratedPageSchema),
    },
  });

  const parsed = parseStructuredJson(GeneratedPageSchema, res.text, `feature page ${feature.title}`);
  done({ feature: feature.title, model: MODELS["g31flash-lite"] });

  const { markdownContent, entryPoints: rawEPs, citations: rawCitations } = parsed;

  const entryPoints: EntryPoint[] = rawEPs.map((ep) => ({
    ...ep,
    githubUrl: ep.githubUrl || buildGitHubUrl(owner, repo, branch, ep.file, ep.line),
  }));

  const citations: Citation[] = rawCitations.map((c) => ({
    ...c,
    githubUrl: c.githubUrl || buildGitHubUrl(owner, repo, branch, c.file, c.startLine, c.endLine),
  }));

  return { markdownContent, entryPoints, citations };
}

/* ─── Generate Overview ─── */

const logOverview = logger("gemini:overview");

const retryableOverview = retryGenerateContent({
  retries: 3,
  onFailedAttempt(ctx) {
    logOverview.warn(
      `Generate overview ${ctx.attemptNumber} failed. Retries left: ${ctx.retriesLeft}. Error: ${ctx.error}`,
    );
  },
});

export async function generateOverview(
  repo: string,
  repoDescription: string,
  readme: string,
  features: Array<{ title: string; summary: string }>,
): Promise<string> {
  const featureList = features.map((f, i) => `${i + 1}. **${f.title}**: ${f.summary}`).join("\n");

  const genOverviewDone = logOverview.time("generateOverview");
  const res = await retryableOverview({
    model: MODELS["g31flash-lite"],
    contents: `Repository: ${repo}
Description: ${repoDescription || "Not provided in repo metadata"}
${readme ? `\nREADME excerpt:\n${readme}` : ""}

Features identified:
${featureList}`,
    config: {
      systemInstruction: `You are a senior technical writer. Generate a concise wiki overview page for a GitHub repository.
Include:
1. A clear description of what the project does (from a user-facing perspective)
2. Key capabilities, functionalities and use cases
3. Architecture overview (if discernible) — use a mermaid diagram if helpful
4. A summary of all features listed below

Write in markdown. Be concise but thorough. Do NOT wrap in a JSON object — return raw markdown only.`,
    },
  });

  const content = res.text || "# Overview\n\nNo overview generated.";
  genOverviewDone({ model: MODELS["g31flash-lite"], length: content.length });
  return content;
}

/* ─── Generate Challenges ─── */

const logChallenges = logger("gemini:challenges");

const ChallengeSchema = z.object({
  role: z.string(),
  background: z.string(),
  objective: z.string(),
  task: z.string(),
  acceptance_criteria: z.string(),
});

const ChallengesResponseSchema = z.object({
  challenges: z.array(ChallengeSchema).length(10),
});

const retryableChallenges = retryGenerateContent({
  retries: 3,
  onFailedAttempt(ctx) {
    logChallenges.warn(
      `Generate challenges attempt ${ctx.attemptNumber} failed. Retries left: ${ctx.retriesLeft}. Error: ${ctx.error}`,
    );
  },
});

export async function generateChallenges(opts: {
  owner: string;
  repo: string;
  overview: string;
  features: Array<{ title: string; summary: string; markdown_content: string }>;
  issues: string;
  pullRequests: string;
}): Promise<z.infer<typeof ChallengeSchema>[]> {
  const { owner, repo, overview, features, issues, pullRequests } = opts;

  const featureContext = features
    .map((f) => `### ${f.title}\n${f.summary}\n${f.markdown_content}`)
    .join("\n\n");

  const systemPrompt = `You are a world-class AI evaluation expert who designs exceptionally tough, realistic agent challenges for large AI labs. 
These challenges are used to stress-test LLM agent capabilities in code understanding, debugging, onboarding, and complex multi-step engineering tasks.

Given a GitHub repository's wiki documentation, features, recent issues, and recent pull requests, generate exactly 10 diverse and challenging agent tasks. 
Each challenge must be a realistic scenario that pushes an agent to:

- Deeply understand the codebase architecture, conventions, and patterns
- Navigate complex multi-file codebases
- Debug subtle, production-grade issues
- Perform multi-step engineering tasks with real-world constraints
- Demonstrate thorough reasoning and exhaustive problem-solving

CHALLENGE DIVERSITY REQUIREMENTS:
- Mix different challenge types: debugging, onboarding, feature implementation, refactoring, performance optimization, migration, security audit, test coverage, documentation, and architecture redesign
- Vary difficulty levels from very hard to extremely hard
- Each challenge must be specific to THIS repository — reference actual subsystems, features, and patterns from the provided context
- Use real issue/PR themes when available to ground challenges in actual codebase problems

OUTPUT FORMAT:
Each challenge must have these fields:
- role: A paragraph defining who the agent is and what expertise they bring (specific to this codebase's tech stack and domain)
- background: A paragraph setting up the scenario with realistic context
- objective: A clear, measurable goal statement (1-2 sentences)
- task: A detailed, numbered task list (use markdown numbered list) with specific steps the agent must complete
- acceptance_criteria: A markdown checklist (using "- [ ]" syntax) of concrete, verifiable criteria for success

Return ONLY valid JSON with this structure:
{
  "challenges": [
    {
      "role": "...",
      "background": "...",
      "objective": "...",
      "task": "1. ...\\n2. ...\\n3. ...",
      "acceptance_criteria": "- [ ] ...\\n- [ ] ...\\n- [ ] ..."
    }
  ]
}`;

  const userPrompt = `Repository: ${owner}/${repo}

## Wiki Overview
${overview.slice(0, 8000)}

## Features & Subsystems
${featureContext.slice(0, 36000)}

${issues ? `## Recent Issues\n${issues.slice(0, 12000)}` : ""}

${pullRequests ? `## Recent Pull Requests\n${pullRequests.slice(0, 12000)}` : ""}`;

  const done = logChallenges.time("generateChallenges");
  const res = await retryableChallenges({
    model: MODELS["g31pro"],
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseJsonSchema: toGeminiJsonSchema(ChallengesResponseSchema),
    },
  });

  const parsed = parseStructuredJson(ChallengesResponseSchema, res.text, "challenge generation");
  done({ challengeCount: parsed.challenges.length, model: MODELS["g31pro"] });
  return parsed.challenges;
}
