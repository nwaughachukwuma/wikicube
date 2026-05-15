import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { GITHUB_REPO_RE } from "@/lib/github";
import { getSupabaseSession } from "@/lib/supabase/server";

const PostSchema = z.object({
  repoUrl: z
    .string()
    .nonempty("repoUrl is required")
    .refine(
      (url) => url.match(GITHUB_REPO_RE),
      "Only GitHub repository URLs are allowed",
    ),
});

export const maxDuration = 300; // 5 minutes for large repos

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "repoUrl is required" }, { status: 400 });
  }

  const session = await getSupabaseSession();
  const githubToken = session?.provider_token || void 0;

  const response = await fetch(`${process.env.BACKEND_URL}/analyze`, {
    method: "POST",
    body: JSON.stringify({
      repoUrl: parsed.data.repoUrl,
      githubToken,
    }),
    headers: {
      "content-type": "application/json",
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
    },
  });

  // If backend returned JSON (cached wiki), forward it directly
  const ct = response.headers.get("content-type") || "";
  if (!ct.includes("text/event-stream")) {
    const body = (await response.json().catch(() => ({
      error: "Backend error",
    }))) as { error?: string };
    return NextResponse.json(body, { status: response.status });
  }

  // Proxy the SSE stream through unchanged
  return new Response(response.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
