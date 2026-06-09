/**
 * Parse `page=n` (single) or `page=x-y` (inclusive range) into a row window.
 */
import { NextRequest, NextResponse } from "next/server";
import { repoGuard, getBearerToken } from "@shared/github";
import { extractError, HttpError } from "@shared/error";
import {
  getWiki,
  getChallengesPage,
  getChallengesByWikiId,
  deleteChallenges,
} from "@/lib/db";
import { generateAndStoreChallenges } from "@/lib/challenges";
import type { Challenge } from "@shared/types";
import { batchAll } from "@shared/batch-ops";

const PAGE_SIZE = 10;
const MAX_CHALLENGES = 25;
const dedupeKey = (c: Pick<Challenge, "objective" | "task">) =>
  `${c.objective}\n${c.task}`.trim().toLowerCase();

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

    const offset = (from - 1) * PAGE_SIZE
    const limit=  (to - from + 1) * PAGE_SIZE
    return { offset, limit:  Math.min(limit, MAX_CHALLENGES-offset) };
  }

  return { error: "page must be a number (n) or a range (x-y)" };
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
  const token = getBearerToken(req.headers);
  const access = await repoGuard(owner, repo, token)
    .then(() => ({ ok: true as const }))
    .catch((err: unknown) => ({
      ok: false as const,
      status: err instanceof HttpError ? err.status : 500,
      error: extractError(err),
    }));

  if (!access.ok) {
    if (token) {
      return NextResponse.json(
        { error: "Repository not found", message: access.error },
        { status: access.status },
      );
    }
    return NextResponse.json(
      {
        error: "Repository not found or is private.",
        message: `Provide a GitHub token via the 'Authorization: Bearer {token}' header.///${access.error}`,
      },
      { status: 401 },
    );
  }

  // Optionally index the repo before reading its challenges.
  const preIndex = sp.get("pre-index") === "true";
  let wiki = await getWiki(owner, repo);
  if (preIndex && (!wiki || wiki.status !== "done")) {
    if (!wiki || wiki.status === "error") {
      void indexRepo(owner, repo, token).catch((e) => {
        console.error("indexRepo failed:", e);
      });
    }
    const statusUrl = `${new URL(req.url).origin}/api/wiki/${owner}/${repo}/status`;
    return NextResponse.json(
      {
        status: "indexing",
        message: "Repository indexing is in progress.",
        status_url: statusUrl,
      },
      { status: 202, headers: { Location: statusUrl } },
    );
  }

  if (!wiki) {
    return NextResponse.json(
      { error: "Repository is not indexed. Retry with pre-index=true." },
      { status: 404 },
    );
  }

  if (wiki.status !== "done") {
    return NextResponse.json(
      { error: "Repository is being indexed. Please try again later" },
      { status: 404 },
    );
  }

  let { challenges } = await getChallengesPage(
    wiki.id,
    pageWindow.offset,
    pageWindow.limit,
  );

  if (challenges.length < pageWindow.limit) {
    const needed = pageWindow.limit - challenges.length;
    const batches = Math.ceil(needed / PAGE_SIZE);
    const rangeN = new Array(batches).fill(0);
    await batchAll(rangeN, () =>
      generateAndStoreChallenges(wiki, owner, repo, token),
    );

    const all = await getChallengesByWikiId(wiki.id);
    const merged = [...all].reverse();

    const seen = new Set<string>();
    const kept: Challenge[] = [];
    const dropIds: string[] = [];

    for (const c of merged) {
      const key = dedupeKey(c);
      if (seen.has(key) || kept.length >= MAX_CHALLENGES) {
        dropIds.push(c.id);
        continue;
      }
      seen.add(key);
      kept.push(c);
    }
    await deleteChallenges(dropIds);

    ({ challenges } = await getChallengesPage(
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
    total: challenges.length,
    total_pages: Math.ceil(challenges.length / PAGE_SIZE),
    challenges,
  });
}
