import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import type { IdentifiedFeature } from "../types";
import { logger } from "../logger";
import { getOpenAI } from "./utils";

const log = logger("openai:identifyFeatures");
const MODEL = "gpt-5-mini";

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
- GOOD examples: "User Authentication", "Real-time Notifications", "Data Export", "Search & Filtering", "Onboarding", "Payment Processing""
- Be exhaustive — identify every meaningful feature, not just the obvious ones
- For each feature, list ALL specific file paths that implement it (routes, components, services, models, middleware, tests, configs)
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

  const done = log.time("identifyFeatures");
  const res = await openai.responses.parse({
    model: MODEL,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    text: {
      format: zodTextFormat(IdentifyFeaturesSchema, "features_response"),
    },
  });

  if (!res.output_parsed) {
    throw new Error("No response from OpenAI for feature identification");
  }

  done({
    featureCount: res.output_parsed.features.length,
    model: MODEL,
  });

  return res.output_parsed.features as IdentifiedFeature[];
}
