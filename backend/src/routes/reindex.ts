import type { FastifyInstance } from "fastify";
import { getWiki } from "../services/db.js";
import { adminRouteGuard } from "../services/auth.js";
import { getServerClient } from "../services/supabase.js";
import { makeJobs } from "../services/queue/index.js";
import { reindexHandler, reindexAllHandler } from "../handlers/reindex.js";
import { z, treeifyError } from "zod";

const ReindexReq = z.object({
  owner: z.string().nonempty("Owner is required"),
  repo: z.string().nonempty("Repo is required"),
});

export default async function reindexRoutes(fastify: FastifyInstance) {
  fastify.post("/reindex", async (request, reply) => {
    const parsed = ReindexReq.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400).send(treeifyError(parsed.error));
      return;
    }

    const { owner, repo } = parsed.data;

    const wiki = await getWiki(owner, repo);
    if (!wiki) {
      return reply.status(404).send({ error: "Wiki not found" });
    }

    if (wiki.status !== "done") {
      return reply
        .status(400)
        .send({ error: "Wiki is not fully generated yet" });
    }

    const handler = makeJobs();
    if (handler) {
      handler.addJob("reindex", { data: wiki });
      reply.send({
        ok: true,
        message: "Reindexing Operation Queued",
      });
      return;
    }

    await reindexHandler(wiki)
      .then(() => reply.send({ ok: "ok" }))
      .catch((err) => reply.status(400).send({ error: err }))
      .finally(() => reply.raw.end());
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

    const results = await reindexAllHandler(wikis);
    return reply.send({ results });
  });

  fastify.post("/queue/healthcheck", async (request, reply) => {
    const handler = makeJobs();
    if (!handler) {
      reply.status(400).send({ ok: false });
      return;
    }

    handler.addBulkJobs([
      { name: "dummy", data: { foo: "bar" } },
      { name: "dummy", data: { qux: "baz" } },
    ]);
    reply.send({ ok: true });
  });
}
