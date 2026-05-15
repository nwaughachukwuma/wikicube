import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getServerClient } from "../services/supabase.js";

const RepoRefSchema = z.object({
  repos: z.array(
    z.object({
      owner: z.string().min(1),
      repo: z.string().min(1),
    }),
  ),
});

export default async function wikisCheckRoutes(fastify: FastifyInstance) {
  fastify.post("/wikis/check", async (request, reply) => {
    const parseResult = RepoRefSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: "Invalid request body",
        details: parseResult.error.errors,
      });
    }

    const { repos } = parseResult.data;
    if (!Array.isArray(repos) || repos.length === 0) {
      return reply.send([]);
    }

    const orFilter = repos
      .map(({ owner, repo }) => `and(owner.eq."${owner}",repo.eq."${repo}")`)
      .join(",");

    const { data, error } = await getServerClient()
      .from("wikis")
      .select("owner, repo")
      .eq("status", "done")
      .or(orFilter);

    if (error) throw error;

    const found = new Set(
      (data ?? []).map((w) => `${w.owner}/${w.repo}`.toLowerCase()),
    );

    const results = repos.map(({ owner, repo }) => ({
      owner,
      repo,
      hasWiki: found.has(`${owner}/${repo}`.toLowerCase()),
    }));

    return reply.send(results);
  });
}
