import type { FastifyInstance } from "fastify";
import { z, treeifyError } from "zod";
import { getBranchHeadSha, repoGuard } from "@shared/github.js";
import { isAdminEmail } from "@shared/constants.js";
import { claimRefresh, getWiki } from "../services/db.js";
import {
  adminRouteGuard,
  getBearerToken,
  getProviderToken,
} from "../services/auth.js";
import { getSupabaseUser } from "../services/supabase.js";
import { runRefresh } from "../services/refresh.js";
import { triggerFreshnessSweep } from "../services/queue/refresh.queue.js";

const RefreshReq = z.object({
  owner: z.string().nonempty("Owner is required"),
  repo: z.string().nonempty("Repo is required"),
});

export default function refreshRoutes(fastify: FastifyInstance) {
  fastify.post("/refresh", async (request, reply) => {
    const parsed = RefreshReq.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send(treeifyError(parsed.error));
    }

    const user = await getSupabaseUser(getBearerToken(request));
    if (!user) {
      return reply.status(401).send({ error: "Authentication required" });
    }

    const { owner, repo } = parsed.data;
    const wiki = await getWiki(owner, repo);
    if (!wiki) {
      return reply.status(404).send({ error: "Wiki not found" });
    }

    // Admins may refresh any wiki. Public wikis otherwise refresh on the
    // schedule; private ones by anyone who can read the repo on GitHub.
    const githubToken = getProviderToken(request);
    if (!(user.email && isAdminEmail(user.email))) {
      const canRead =
        wiki.visibility === "private" &&
        !!githubToken &&
        (await repoGuard(owner, repo, githubToken).then(
          () => true,
          () => false,
        ));
      if (!canRead) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      // Each regeneration costs a full LLM run: skip it when nothing changed
      const head = await getBranchHeadSha(
        owner,
        repo,
        wiki.default_branch,
        githubToken,
      ).catch(() => null);
      if (head && head === wiki.source_commit_sha) {
        return reply.send({ status: "up_to_date" });
      }
    }

    const claimed = await claimRefresh(wiki.id);
    if (!claimed) {
      return reply.status(409).send({
        error:
          wiki.status === "done"
            ? "This wiki is already being regenerated"
            : "Wiki is not fully generated yet",
      });
    }

    // runRefresh records failures on the wiki row
    void runRefresh(claimed, githubToken).catch(() => {});
    return reply.status(202).send({ status: "refreshing" });
  });

  fastify.post("/refresh-stale", async (request, reply) => {
    const user = await adminRouteGuard(getBearerToken(request));
    if (!user) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    await triggerFreshnessSweep();
    return reply.status(202).send({ status: "checking" });
  });
}
