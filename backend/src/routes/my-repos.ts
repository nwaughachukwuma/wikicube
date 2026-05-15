import type { FastifyInstance } from "fastify";
import { getSupabaseUser } from "../services/supabase.js";
import { getServerClient } from "../services/supabase.js";

interface GitHubRepo {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
  description: string | null;
  private: boolean;
  updated_at: string;
  stargazers_count: number;
  language: string | null;
}

export default async function myReposRoutes(fastify: FastifyInstance) {
  fastify.get("/my-repos", async (request, reply) => {
    const authHeader = request.headers.authorization ?? "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

    const user = await getSupabaseUser(bearerToken);
    if (!user) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const githubToken = request.headers["x-github-token"] as string | undefined;
    if (!githubToken) {
      return reply
        .status(403)
        .send({ error: "No GitHub token. Please re-authenticate." });
    }

    const ghRes = await fetch(
      "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member&visibility=all",
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );

    if (!ghRes.ok) {
      return reply.status(502).send({
        error: `GitHub API error: ${ghRes.status}`,
      });
    }

    const allRepos = (await ghRes.json()) as GitHubRepo[];
    if (allRepos.length === 0) {
      return reply.send([]);
    }

    const orFilter = allRepos
      .map(
        ({ owner, name }) => `and(owner.eq."${owner.login}",repo.eq."${name}")`,
      )
      .join(",");

    const { data: wikiRows } = await getServerClient()
      .from("wikis")
      .select("owner, repo")
      .eq("status", "done")
      .or(orFilter);

    const wikiSet = new Set(
      (wikiRows ?? []).map((w) => `${w.owner}/${w.repo}`.toLowerCase()),
    );

    const result = allRepos.map((repo) => ({
      ...repo,
      hasWiki: wikiSet.has(`${repo.owner.login}/${repo.name}`.toLowerCase()),
    }));

    return reply.headers({ "Cache-Control": "private, no-store" }).send(result);
  });
}
