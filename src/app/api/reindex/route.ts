import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSession } from "@/lib/supabase/server";
import { HttpError } from "@shared/error";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { owner, repo } = body;

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "owner and repo are required" },
      { status: 400 },
    );
  }

  const session = await getSupabaseSession();
  const githubToken = session?.provider_token || void 0;

  const response = await fetch(`${process.env.BACKEND_URL}/reindex`, {
    method: "POST",
    body: JSON.stringify({ owner, repo, githubToken }),
    headers: {
      "content-type": "application/json",
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
    },
  });

  if (!response.ok || response.status >= 300) {
    return NextResponse.json(
      { error: HttpError.getHumanReadableMessage(response) },
      { status: response.status },
    );
  }

  return NextResponse.json(await response.json(), { status: 200 });
}
