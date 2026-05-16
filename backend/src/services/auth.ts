import type { FastifyReply } from "fastify";
import { getSupabaseUser } from "./supabase.js";
import { ADMIN_EMAILS } from "@shared/constants.js";

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

export async function adminRouteGuard(token?: string, reply?: FastifyReply) {
  const { user, err } = await authRouteGuard(token, reply);
  if (err) return { user: null, err };

  if (!user.email || !ADMIN_EMAILS.has(user.email)) {
    if (reply) {
      reply.status(403).send({ error: "Forbidden" });
    }
    return { user: null, err: { error: "Forbidden" } };
  }
  return { user, err: null };
}
