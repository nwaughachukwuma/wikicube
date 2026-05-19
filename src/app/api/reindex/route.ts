import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSession } from "@/lib/supabase/server";
import { HttpError } from "@shared/error";
import { repoGuard } from "@shared/github";
import { z } from "zod";

const ReindexReq = z.object({
  owner: z.string().nonempty("owner is required"),
  repo: z.string().nonempty("repo is required"),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = ReindexReq.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const { owner, repo } = parsed.data;
  const requireAuth = await repoGuard(owner, repo)
    .then(() => false)
    .catch(() => true);

  const session = await getSupabaseSession();
  if (requireAuth && !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (requireAuth && !session?.provider_token) {
    return NextResponse.json(
      { error: "Please re-authenticate." },
      { status: 403 },
    );
  }

  const response = await fetch(`${process.env.BACKEND_BASE_URL}/reindex`, {
    method: "POST",
    body: JSON.stringify({ owner, repo }),
    headers: {
      "content-type": "application/json",
      "User-Agent": "wikicube/1.0",
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
      ...(session?.provider_token
        ? { "X-Provider-Token": session.provider_token }
        : {}),
    },
  });

  if (!response.ok || response.status >= 300) {
    return NextResponse.json(
      { error: HttpError.getHumanReadableMessage(response) },
      { status: response.status },
    );
  }

  return NextResponse.json(await response.text(), { status: 200 });
}
