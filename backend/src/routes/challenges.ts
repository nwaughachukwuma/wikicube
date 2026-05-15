import type { FastifyInstance } from "fastify";
import { getWiki, getFeatures, getChallengesByWikiId, insertChallenges } from "../services/db.js";
import { getRecentIssues, getRecentPullRequests } from "../services/github.js";
import { generateChallenges } from "../services/genai.js";
import { getSupabaseUser } from "../services/supabase.js";
import { privateWikiGuard } from "../services/auth.js";

export default async function challengesRoutes(fastify: FastifyInstance) {
  fastify.get("/challenges/:owner/:repo", async (request, reply) => {
    const { owner, repo } = request.params as { owner: string; repo: string };

    const wiki = await getWiki(owner, repo);
    if (!wiki) {
      return reply.status(404).send({ error: "Wiki not found" });
    }

    if (wiki.visibility === "private") {
      const authHeader = request.headers.authorization ?? "";
      const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
      const user = await getSupabaseUser(bearerToken);
      const guard = privateWikiGuard(wiki, user?.id, reply);
      if (guard && guard.error) return reply.status(403).send(guard);
    }

    const challenges = await getChallengesByWikiId(wiki.id);
    return reply.send({ challenges, wiki_id: wiki.id });
  });

  fastify.post("/challenges/:owner/:repo", async (request, reply) => {
    const { owner, repo } = request.params as { owner: string; repo: string };

    const wiki = await getWiki(owner, repo);
    if (!wiki || wiki.status !== "done") {
      return reply.status(404).send({ error: "Wiki not found or not ready" });
    }

    if (wiki.visibility === "private") {
      const authHeader = request.headers.authorization ?? "";
      const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
      const user = await getSupabaseUser(bearerToken);
      const guard = privateWikiGuard(wiki, user?.id, reply);
      if (guard && guard.error) return reply.status(403).send(guard);
    }

    const existing = await getChallengesByWikiId(wiki.id);
    if (existing.length > 0) {
      return reply.send({ challenges: existing, wiki_id: wiki.id });
    }

    const features = await getFeatures(wiki.id);
    const [issues, pullRequests] = await Promise.all([
      getRecentIssues(owner, repo),
      getRecentPullRequests(owner, repo),
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

    const challenges = await insertChallenges(
      generated.map((c) => ({
        wiki_id: wiki.id,
        role: c.role,
        background: c.background,
        objective: c.objective,
        task: c.task,
        acceptance_criteria: c.acceptance_criteria,
      })),
    );

    return reply.send({ challenges, wiki_id: wiki.id });
  });
}
