import { NextResponse } from "next/server";
import { getServerClient, getSupabaseUser } from "@/lib/supabase/server";
import { ADMIN_EMAILS } from "@shared/constants";
import type { Wiki } from "@shared/types";
import { HttpError } from "@shared/error";
import { batchAll } from "@shared/batch-ops";

export async function GET() {
  const user = await getSupabaseUser();
  if (!user?.email || !ADMIN_EMAILS.has(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: wikis, error } = await getServerClient()
    .from("wikis")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!wikis?.length) {
    return NextResponse.json({ wikis: [] });
  }
  // const enriched = await getEnriched(wikis);
  return NextResponse.json({ wikis });
}

// Fetch GitHub metadata for each wiki in parallel
async function getEnriched(wikis: Wiki[]) {
  return batchAll(
    wikis,
    async (wiki) => {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${wiki.owner}/${wiki.repo}`,
          {
            headers: {
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "wikicube/1.0",
            },
          },
        );

        if (!res.ok) throw new HttpError(res);

        const gh = (await res.json()) as {
          description: string | null;
          updated_at: string;
        };
        return {
          ...wiki,
          description: gh.description ?? "",
          github_updated_at: gh.updated_at,
        };
      } catch (err) {
        console.error(">><<", err);
      }

      return { ...wiki, description: "", github_updated_at: null };
    },
    10,
  );
}
