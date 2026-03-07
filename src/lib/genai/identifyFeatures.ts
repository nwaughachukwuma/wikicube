import { z } from "zod";
import type { IdentifiedFeature } from "../types";
import { logger } from "../logger";
import {
  MODELS,
  parseStructuredJson,
  retryGenerateContent,
  toGeminiJsonSchema,
} from "./utils";

const log = logger("gemini:identifyFeatures");

/* ─── Zod schemas for structured outputs ─── */
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

const retryable = retryGenerateContent({
  retries: 3,
  onFailedAttempt(ctx) {
    log.warn(
      `Identify features ${ctx.attemptNumber} failed.` +
        `There are ${ctx.retriesLeft} retries left. Error: ${ctx.error}`,
    );
  },
});

/* ─── Phase B: Identify features from file tree ─── */

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
  - For each feature, list ALL specific and relevant file paths (using the file tree) that implement it (routes, components, services, models, middleware, configs)
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

  // Cap inputs to avoid blowing the context window.
  // These limits keep the prompt bounded while preserving enough signal
  // while capturing enough signal for accurate feature identification.
  const cappedReadme = readme.slice(0, 12_000);
  const cappedManifests = manifests.slice(0, 6_000);
  const cappedTree = treeString.slice(0, 8_000);

  const userPrompt = `Repository: ${repo}
  Description: ${repoDescription || "Not provided"}

  ${cappedManifests ? `Project manifests:\n${cappedManifests}\n` : ""}
  ${cappedReadme ? `README:\n${cappedReadme}\n` : "No README found."}

  File tree:
  ${cappedTree}`;

  const done = log.time("identifyFeatures");
  const res = await retryable({
    model: MODELS["g31pro"],
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseJsonSchema: toGeminiJsonSchema(IdentifyFeaturesSchema),
    },
  });

  const parsed = parseStructuredJson(
    IdentifyFeaturesSchema,
    res.text,
    "feature identification",
  );

  done({
    featureCount: parsed.features.length,
    model: MODELS["g31pro"],
  });
  return parsed.features as IdentifiedFeature[];
}
