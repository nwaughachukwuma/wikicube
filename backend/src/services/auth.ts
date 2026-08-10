import type { FastifyRequest } from "fastify";
import { getSupabaseUser } from "./supabase.js";
import { isAdminEmail } from "@shared/constants.js";

export function getBearerToken(request: FastifyRequest) {
  const authHeader = request.headers.authorization ?? "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;

  return bearerToken;
}

export const getProviderToken = (request: FastifyRequest) =>
  request.headers["x-provider-token"] as string | undefined;

export async function adminRouteGuard(token?: string) {
  const user = await getSupabaseUser(token);
  if (!user?.email || !isAdminEmail(user.email)) {
    return null;
  }
  return user;
}
