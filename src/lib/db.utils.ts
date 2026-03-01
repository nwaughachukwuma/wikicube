import { NextResponse } from "next/server";
import { getSupabaseUser } from "./supabase/server";
import type { Wiki } from "./types";

/**
 * Enforce access control for private wikis
 *
 * Check whether a user may access a given wiki.
 * Public wikis are accessible to everyone; private wikis require the user to
 * be the one who indexed them (indexed_by === userId).
 */
export function canAccessWiki(
  wiki: Wiki,
  userId: string | null | undefined,
): boolean {
  if (wiki.visibility !== "private") return true;
  return !!userId && wiki.indexed_by === userId;
}

export function privateWikiGuard(wiki: Wiki, userId?: string | null) {
  if (!canAccessWiki(wiki, userId)) {
    return NextResponse.json(
      { error: "You do not have access to this wiki" },
      { status: 403 },
    );
  }
}

export async function authRouteGuard(customError?: string) {
  const user = await getSupabaseUser();
  if (!user) {
    return {
      user: null,
      err: NextResponse.json(
        { error: customError || "Authentication required" },
        { status: 401 },
      ),
    };
  }
  return { user, err: null };
}
