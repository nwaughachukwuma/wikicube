import { NextRequest, NextResponse } from "next/server";
import { repoGuard } from "@shared/github";
import { HttpError } from "@shared/error";
import { getWiki, getChallengesPage } from "@/lib/db";
import { generateAndStoreChallenges } from "@/lib/challenges";

const PAGE_SIZE = 10;

/** Parse `page=n` (single) or `page=x-y` (inclusive range) into a row window. */
function parsePage(
  raw: string | null,
): { offset: number; limit: number } | { error: string } {
  if (!raw) return { offset: 0, limit: PAGE_SIZE };

  const single = raw.match(/^(\d+)$/);
  if (single) {
    const n = Number(single[1]);
    if (n < 1) return { error: "page must be >= 1" };
    return { offset: (n - 1) * PAGE_SIZE, limit: PAGE_SIZE };
  }

  const range = raw.match(/^(\d+)-(\d+)$/);
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    if (from < 1 || to < from) return { error: "invalid page range" };
    return { offset: (from - 1) * PAGE_SIZE, limit: (to - from + 1) * PAGE_SIZE };
  }

  return { error: "page must be a number (n) or a range (x-y)" };
}

function getBearerToken(req: NextRequest): string | undefined {
  const header = req.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : undefined;
}

/** Trigger indexing on the backend and resolve once it completes. */
async function indexRepo(owner: string, repo: string, token?: string) {
  const res = await fetch(`${process.env.BACKEND_BASE_URL}/analyze`, {
    method: "POST",
    body: JSON.stringify({ repoUrl: `${owner}/${repo}` }),
    headers: {
      "content-type": "application/json",
      "User-Agent": "wikicube/1.0",
      ...(token ? { "X-Provider-Token": token } : {}),
    },
  });

  if (!res.ok) {
    throw new HttpError(res, await res.text().catch(() => undefined));
  }

  // Already-indexed repos return JSON immediately; fresh ones stream SSE.
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    await res.json().catch(() => ({}));
    return;
  }

  // Drain the SSE stream until the pipeline emits `done` or `error`.
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const evt of events) {
      const line = evt.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const payload = JSON.parse(line.slice(6)) as {
        type?: string;
        message?: string;
      };
      if (payload.type === "done") return;
      if (payload.type === "error") {
        throw new Error(payload.message || "Indexing failed");
      }
    }
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;
  const sp = req.nextUrl.searchParams;

  const pageWindow = parsePage(sp.get("page"));
  if ("error" in pageWindow) {
    return NextResponse.json({ error: pageWindow.error }, { status: 400 });
  }

  // Access control: public repos are open; private repos require a token.
  const token = getBearerToken(req);
  const access = await repoGuard(owner, repo, token)
    .then(() => ({ ok: true as const }))
    .catch((err: unknown) => ({
      ok: false as const,
      status: err instanceof HttpError ? err.status : 500,
    }));

  if (!access.ok) {
    if (!token) {
      return NextResponse.json(
        {
          error: "repo is private",
          message:
            "This repository is private. Provide a GitHub token via the 'Authorization: Bearer {token}' header.",
        },
        { status: 401 },
      );
    }
    const status = access.status === 404 ? 404 : access.status;
    return NextResponse.json(
      { error: "Repository not found or token lacks access" },
      { status },
    );
  }

  // Optionally index the repo before reading its challenges.
  const preIndex = sp.get("pre-index") === "true";
  let wiki = await getWiki(owner, repo);
  if (preIndex && (!wiki || wiki.status !== "done")) {
    await indexRepo(owner, repo, token);
    wiki = await getWiki(owner, repo);
  }

  if (!wiki || wiki.status !== "done") {
    return NextResponse.json(
      {
        error: "Repository is not indexed. Retry with pre-index=true.",
      },
      { status: 404 },
    );
  }

  // Generate a batch on first access so the endpoint never returns empty.
  let { challenges, total } = await getChallengesPage(
    wiki.id,
    pageWindow.offset,
    pageWindow.limit,
  );
  if (total === 0) {
    await generateAndStoreChallenges(wiki, owner, repo, token);
    ({ challenges, total } = await getChallengesPage(
      wiki.id,
      pageWindow.offset,
      pageWindow.limit,
    ));
  }

  return NextResponse.json({
    owner,
    repo,
    wiki_id: wiki.id,
    page_size: PAGE_SIZE,
    total,
    total_pages: Math.ceil(total / PAGE_SIZE),
    challenges,
  });
}
