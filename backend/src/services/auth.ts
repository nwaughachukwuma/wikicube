import type { FastifyReply } from "fastify";
import { getSupabaseUser } from "./supabase.js";

export async function authRouteGuard(
  token?: string,
  reply?: FastifyReply,
  customError?: string,
) {
  const user = await getSupabaseUser(token);
  if (!user) {
    const payload = { error: customError || "Authentication required" };
    if (reply) {
      reply.status(401).send(payload);
    }
    return { user: null, err: payload };
  }
  return { user, err: null };
}
