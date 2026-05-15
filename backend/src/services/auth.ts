import type { FastifyReply } from "fastify";
import { getSupabaseUser } from "./supabase.js";
import type { Wiki } from "@shared/types.js";

export function canAccessWiki(
  wiki: Wiki,
  userId: string | null | undefined,
): boolean {
  if (wiki.visibility !== "private") return true;
  return !!userId && wiki.indexed_by === userId;
}

export function privateWikiGuard(
  wiki: Wiki,
  userId?: string | null,
  reply?: FastifyReply,
) {
  if (!canAccessWiki(wiki, userId)) {
    if (reply) {
      reply.status(403).send({ error: "You do not have access to this wiki" });
    }
    return { error: "You do not have access to this wiki" };
  }
  return null;
}

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
