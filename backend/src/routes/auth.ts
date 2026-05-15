import type { FastifyInstance } from "fastify";
import { getServerClient } from "../services/supabase.js";

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.get("/auth/callback", async (request, reply) => {
    const { code, next } = request.query as { code?: string; next?: string };

    if (code) {
      const supabase = getServerClient();
      await supabase.auth.exchangeCodeForSession(code);
    }

    const safeNext = next && next.startsWith("/") ? next : "/";
    return reply.redirect(safeNext, 302);
  });
}
