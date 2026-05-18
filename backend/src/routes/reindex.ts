import type { FastifyInstance } from "fastify";
import { getWiki } from "../services/db.js";
import { adminRouteGuard } from "../services/auth.js";
import { getServerClient } from "../services/supabase.js";
import { makeJobs } from "../services/queue/index.js";
import { reindexHandler, reindexAllHandler } from "../handlers/reindex.js";

export default async function reindexRoutes(fastify: FastifyInstance) {
  fastify.post("/reindex", async (request, reply) => {
    const { owner, repo } = request.body as { owner: string; repo: string };
    if (!owner || !repo) {
      return reply.status(400).send({ error: "owner and repo are required" });
    }

    const wiki = await getWiki(owner, repo);
    if (!wiki) {
      return reply.status(404).send({ error: "Wiki not found" });
    }

    if (wiki.status !== "done") {
      return reply
        .status(400)
        .send({ error: "Wiki is not fully generated yet" });
    }

    await reindexHandler(wiki, reply);
  });

  fastify.post("/reindex-all", async (request, reply) => {
    const authHeader = request.headers.authorization ?? "";
    const bearerToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    const { err } = await adminRouteGuard(bearerToken, reply);
    if (err) return;

    const { data: wikis, error } = await getServerClient()
      .from("wikis")
      .select("*")
      .eq("status", "done");

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    const results = await reindexAllHandler(wikis, reply);
    return reply.send({ results });
  });

  fastify.post("/use-queue", async (request, reply) => {
    makeJobs().addBulkJobs([
      { name: "myJobName", data: { foo: "bar" } },
      { name: "myJobName", data: { qux: "baz" } },
    ]);
    reply.send({ ok: true });
  });
}
