import type { FastifyInstance } from "fastify";
import { getWiki, getFeatures } from "../services/db.js";
import { reindexWikiAndCode } from "../services/reindex.js";

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

    const features = await getFeatures(wiki.id);

    await reindexWikiAndCode(owner, repo, {
      githubToken: undefined,
      userId: undefined,
      visibility: wiki.visibility,
      skipToEmbedding: true,
      existingFeatures: features,
      existingOverview: wiki.overview,
    })
      .then(() => reply.send({ ok: "ok" }))
      .catch(async (err) => reply.status(400).send({ error: err }))
      .finally(() => reply.raw.end());
  });
}
