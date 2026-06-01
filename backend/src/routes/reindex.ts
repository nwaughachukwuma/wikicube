import type { FastifyInstance } from "fastify";
import { z, treeifyError } from "zod";
import { getWiki } from "../services/db.js";
import {
  adminRouteGuard,
  getBearerToken,
  getProviderToken,
} from "../services/auth.js";
import { getServerClient } from "../services/supabase.js";
import { queueJobs } from "../services/queue/index.js";
import { reindexAllHandler } from "../utils/reindex.js";
import { reindexWikiAndCode } from "../services/reindex.js";

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

    const githubToken = getProviderToken(request);
    await reindexWikiAndCode(wiki, githubToken)
      .then(() => reply.send("Reindexing completed"))
      .catch((err) => reply.status(400).send({ error: err }))
      .finally(() => reply.raw.end());
  });

  fastify.post("/reindex-all", async (request, reply) => {
    const bearerToken = getBearerToken(request);
    const user = await adminRouteGuard(bearerToken);
    if (!user) {
      reply.status(403).send({ error: "Forbidden" });
      return;
    }

    const { data: wikis, error } = await getServerClient()
      .from("wikis")
      .select("*")
      .eq("status", "done");

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    const githubToken = getProviderToken(request);

    const reindexHandler = (await queueJobs()).reindex;
    if (reindexHandler) {
      reindexHandler.add("reindex-all", { wikis, githubToken });
      reply.send("Reindex-all operation is queued");
      return;
    }

    const results = await reindexAllHandler(wikis, githubToken);
    return reply.send({ results });
  });

  fastify.post("/queue/healthcheck", async (_, reply) => {
    const reindexHandler = (await queueJobs()).reindex;
    if (!reindexHandler) {
      reply.status(400).send({ ok: false });
      return;
    }

    reindexHandler.addBulk([
      { name: "dummy", data: { foo: "bar" } },
      { name: "dummy", data: { qux: "baz" } },
    ]);
    reply.send({ ok: true });
  });
}
