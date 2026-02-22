/* ─── Phase E: Generate overview page ─── */

import { logger } from "../logger";
import { getOpenAI, MODEL } from "./utils";

const log = logger("openai:overview");

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

  const done = log.time("generateOverview");
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
        ${readme ? `\nREADME excerpt:\n${readme}` : ""} // .slice(0, 3000)

        Features identified:
        ${featureList}`,
      },
    ],
  });

  const content =
    res.choices[0]?.message?.content || "# Overview\n\nNo overview generated.";
  done({ model: MODEL, length: content.length });
  return content;
}
