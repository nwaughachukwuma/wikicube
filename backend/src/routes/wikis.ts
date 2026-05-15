import type { FastifyInstance } from "fastify";
import { getServerClient } from "../services/supabase.js";

export default async function wikisRoutes(fastify: FastifyInstance) {
  fastify.get("/wikis", async (_request, reply) => {
    const { data, error } = await getServerClient()
      .from("wikis")
      .select("id, owner, repo, status, created_at, updated_at")
      .eq("status", "done")
      .eq("visibility", "public")
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return reply.send(data ?? []);
  });
}
