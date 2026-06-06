import { getFeatures, insertChallenges } from "@/lib/db";
import { getRecentIssues, getRecentPullRequests } from "@shared/github";
import { generateChallenges } from "@shared/genai/generate-challenges";
import type { Challenge, Wiki } from "@shared/types";

/** Generate a fresh batch of challenges for a wiki and persist them. */
export async function generateAndStoreChallenges(
  wiki: Wiki,
  owner: string,
  repo: string,
  token?: string,
): Promise<Challenge[]> {
  const features = await getFeatures(wiki.id);
  const [issues, pullRequests] = await Promise.all([
    getRecentIssues(owner, repo, token),
    getRecentPullRequests(owner, repo, token),
  ]);

  const generated = await generateChallenges({
    owner,
    repo,
    overview: wiki.overview,
    features: features.map((f) => ({
      title: f.title,
      summary: f.summary,
      markdown_content: f.markdown_content,
    })),
    issues,
    pullRequests,
  });

  return insertChallenges(
    generated.map((c) => ({
      wiki_id: wiki.id,
      role: c.role,
      background: c.background,
      objective: c.objective,
      task: c.task,
      acceptance_criteria: c.acceptance_criteria,
    })),
  );
}
