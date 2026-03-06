/* ─── Phase E: Generate overview page ─── */

import { logger } from "../logger";
import { MODELS, retryGenerateContent } from "./utils";

const log = logger("gemini:overview");

const retryable = retryGenerateContent({
  retries: 3,
  onFailedAttempt(ctx) {
    log.warn(
      `Generate overview ${ctx.attemptNumber} failed.` +
        `There are ${ctx.retriesLeft} retries left. Error: ${ctx.error}`,
    );
  },
});

export async function generateOverview(
  repo: string,
  repoDescription: string,
  readme: string,
  features: Array<{ title: string; summary: string }>,
): Promise<string> {
  const featureList = features
    .map((f, i) => `${i + 1}. **${f.title}**: ${f.summary}`)
    .join("\n");

  const genOverviewDone = log.time("generateOverview");
  const res = await retryable({
    model: MODELS["g31flash-lite"],
    contents: `Repository: ${repo}
        Description: ${repoDescription || "Not provided in repo metadata"}
        ${readme ? `\nREADME excerpt:\n${readme}` : ""} // .slice(0, 3000)

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

  genOverviewDone({
    model: MODELS["g31flash-lite"],
    length: content.length,
  });
  return content;
}
