import { NextRequest, NextResponse } from "next/server";
import { getSupabaseSession } from "@/lib/supabase/server";
import { HttpError } from "@shared/error";

/** Regenerate a wiki in place; the backend decides who may do so */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;
  const session = await getSupabaseSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = await fetch(`${process.env.BACKEND_BASE_URL}/refresh`, {
    method: "POST",
    body: JSON.stringify({ owner, repo }),
    headers: {
      "content-type": "application/json",
      "User-Agent": "wikicube/1.0",
      Authorization: `Bearer ${session.access_token}`,
      ...(session.provider_token
        ? { "X-Provider-Token": session.provider_token }
        : {}),
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      typeof body?.error === "string"
        ? body.error
        : HttpError.getHumanReadableMessage(response);
    return NextResponse.json({ error }, { status: response.status });
  }
  return NextResponse.json(body, { status: response.status });
}
