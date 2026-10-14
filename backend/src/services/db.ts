import { batchAll } from "@shared/batch-ops.js";
import { logger } from "@shared/logger.js";
import { REFRESH_LOCK_TTL_MS } from "@shared/constants.js";
import { getServerClient } from "./supabase.js";
import type {
  Wiki,
  Feature,
  WikiStatus,
  Chunk,
  WikiChat,
  ChatSession,
  Challenge,
} from "@shared/types.js";
import { withRetry } from "./retry.js";

const log = logger("db");

function stripNullBytes<T>(obj: T): T {
  if (typeof obj === "string") return obj.replace(/\0/g, "") as unknown as T;
  if (Array.isArray(obj)) return obj.map(stripNullBytes) as unknown as T;
  if (obj && typeof obj === "object") {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      cleaned[k] = stripNullBytes(v);
    }
    return cleaned as T;
  }
  return obj;
}

/* ─── Wikis ─── */

export async function upsertWiki(
  owner: string,
  repo: string,
  defaultBranch: string,
  opts: { visibility?: "public" | "private"; indexedBy?: string } = {},
): Promise<Wiki> {
  const db = getServerClient();

  const { data: existing } = await db
    .from("wikis")
    .select("*")
    .eq("owner", owner)
    .eq("repo", repo)
    .single();

  if (existing) {
    if (existing.status === "done") {
      log.info("wiki already done", { wikiId: existing.id, owner, repo });
      return existing as Wiki;
    }

    log.info("resetting existing wiki", { wikiId: existing.id, owner, repo });
    const { data, error } = await db
      .from("wikis")
      .update({
        status: "pending" as WikiStatus,
        default_branch: defaultBranch,
        visibility: opts.visibility ?? existing.visibility ?? "public",
        indexed_by: opts.indexedBy ?? existing.indexed_by ?? null,
        search_ready: false,
        search_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) throw error;

    await Promise.all([
      db.from("chunks").delete().eq("wiki_id", existing.id),
      db.from("features").delete().eq("wiki_id", existing.id),
    ]);

    return data as Wiki;
  }

  const { data, error } = await db
    .from("wikis")
    .insert({
      owner,
      repo,
      default_branch: defaultBranch,
      overview: "",
      status: "pending" as WikiStatus,
      visibility: opts.visibility ?? "public",
      indexed_by: opts.indexedBy ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  log.info("wiki created", { wikiId: data.id, owner, repo });
  return data as Wiki;
}

export async function updateWikiStatus(
  wikiId: string,
  status: WikiStatus,
  overview?: string,
) {
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (overview !== undefined) updates.overview = stripNullBytes(overview);

  await withRetry("update wiki status", async () => {
    const { error } = await getServerClient()
      .from("wikis")
      .update(stripNullBytes(updates))
      .eq("id", wikiId);
    if (error) throw error;
  });
}

export async function markSearchReady(wikiId: string): Promise<void> {
  await withRetry("mark search ready", async () => {
    const { error } = await getServerClient()
      .from("wikis")
      .update({
        search_ready: true,
        search_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", wikiId);
    if (error) throw error;
  });
}

export async function markSearchFailed(
  wikiId: string,
  errorMessage: string,
): Promise<void> {
  await withRetry("mark search failed", async () => {
    const { error } = await getServerClient()
      .from("wikis")
      .update({
        search_ready: false,
        search_error: stripNullBytes(errorMessage),
        updated_at: new Date().toISOString(),
      })
      .eq("id", wikiId);
    if (error) throw error;
  });
}

/** Make a finished generation the live one and record its source commit */
export async function completeGeneration(
  wikiId: string,
  params: {
    generation: number;
    overview: string;
    defaultBranch: string;
    commitSha: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await withRetry("complete generation", async () => {
    const { error } = await getServerClient()
      .from("wikis")
      .update({
        status: "done" as WikiStatus,
        overview: stripNullBytes(params.overview),
        generation: params.generation,
        default_branch: params.defaultBranch,
        source_commit_sha: params.commitSha,
        latest_commit_sha: params.commitSha,
        generated_at: now,
        checked_at: now,
        // the search index is rebuilt for the new generation right after
        search_ready: false,
        search_error: null,
        // a refresh keeps its lock until the search index is rebuilt
        refresh_error: null,
        updated_at: now,
      })
      .eq("id", wikiId);
    if (error) throw error;
  });
}

/**
 * Take the refresh lock on a finished wiki. Returns the locked wiki, or null
 * when it isn't finished or another refresh holds the lock.
 */
export async function claimRefresh(wikiId: string): Promise<Wiki | null> {
  const now = Date.now();
  const expired = new Date(now - REFRESH_LOCK_TTL_MS).toISOString();
  const { data, error } = await getServerClient()
    .from("wikis")
    .update({
      refresh_started_at: new Date(now).toISOString(),
      refresh_error: null,
    })
    .eq("id", wikiId)
    .eq("status", "done")
    .or(`refresh_started_at.is.null,refresh_started_at.lt."${expired}"`)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as Wiki | null;
}

/** Release the refresh lock once a refresh's search index is rebuilt */
export async function releaseRefresh(wikiId: string): Promise<void> {
  await withRetry("release refresh", async () => {
    const { error } = await getServerClient()
      .from("wikis")
      .update({ refresh_started_at: null })
      .eq("id", wikiId);
    if (error) throw error;
  });
}

/** Release the refresh lock after a failed refresh */
export async function failRefresh(
  wikiId: string,
  errorMessage: string,
): Promise<void> {
  await withRetry("fail refresh", async () => {
    const { error } = await getServerClient()
      .from("wikis")
      .update({
        refresh_started_at: null,
        refresh_error: stripNullBytes(errorMessage),
      })
      .eq("id", wikiId);
    if (error) throw error;
  });
}

/** Finished public wikis, least recently generated first */
export async function listRefreshCandidates(): Promise<Wiki[]> {
  const { data, error } = await getServerClient()
    .from("wikis")
    .select("*")
    .eq("status", "done")
    .eq("visibility", "public")
    .order("generated_at", { ascending: true, nullsFirst: true });
  if (error) throw error;
  return (data || []) as Wiki[];
}

/**
 * Store the default-branch HEAD seen by a freshness check, and the source
 * commit worked out for a wiki that predates commit tracking
 */
export async function recordFreshnessCheck(
  wikiId: string,
  params: { latestSha: string; backfillSourceSha?: string },
): Promise<void> {
  const db = getServerClient();
  const { error } = await db
    .from("wikis")
    .update({
      latest_commit_sha: params.latestSha,
      checked_at: new Date().toISOString(),
    })
    .eq("id", wikiId);
  if (error) throw error;

  if (params.backfillSourceSha) {
    // Never overwrite a commit recorded by a generation that just finished
    const { error } = await db
      .from("wikis")
      .update({ source_commit_sha: params.backfillSourceSha })
      .eq("id", wikiId)
      .is("source_commit_sha", null);
    if (error) throw error;
  }
}

export async function deleteChunks(wikiId: string) {
  await withRetry("delete chunks", async () => {
    const { error } = await getServerClient()
      .from("chunks")
      .delete()
      .eq("wiki_id", wikiId);
    if (error) throw error;
  });
}

export async function getWiki(
  owner: string,
  repo: string,
): Promise<Wiki | null> {
  const { data } = await getServerClient()
    .from("wikis")
    .select("*")
    .eq("owner", owner)
    .eq("repo", repo)
    .single();
  return data as Wiki | null;
}

export async function getWikiById(wikiId: string): Promise<Wiki | null> {
  const { data } = await getServerClient()
    .from("wikis")
    .select("*")
    .eq("id", wikiId)
    .single();
  return data as Wiki | null;
}

/* ─── Features ─── */

export async function insertFeature(
  feature: Omit<Feature, "id">,
): Promise<Feature> {
  const { data, error } = await getServerClient()
    .from("features")
    .insert(stripNullBytes(feature))
    .select()
    .single();
  if (error) throw error;
  return data as Feature;
}

export async function getFeatures(
  wikiId: string,
  generation: number,
): Promise<Feature[]> {
  const { data, error } = await getServerClient()
    .from("features")
    .select("*")
    .eq("wiki_id", wikiId)
    .eq("generation", generation)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data || []) as Feature[];
}

/** Drop pages left by an unfinished refresh (generations above the live one) */
export async function deleteFeaturesAboveGeneration(
  wikiId: string,
  generation: number,
): Promise<void> {
  await withRetry("delete unfinished features", async () => {
    const { error } = await getServerClient()
      .from("features")
      .delete()
      .eq("wiki_id", wikiId)
      .gt("generation", generation);
    if (error) throw error;
  });
}

/** Drop feature generations older than `generation` */
export async function deleteFeaturesBelowGeneration(
  wikiId: string,
  generation: number,
): Promise<void> {
  await withRetry("delete old features", async () => {
    const { error } = await getServerClient()
      .from("features")
      .delete()
      .eq("wiki_id", wikiId)
      .lt("generation", generation);
    if (error) throw error;
  });
}

/* ─── Chunks & Embeddings ─── */

export async function insertChunks(
  chunks: Array<Omit<Chunk, "id">>,
): Promise<void> {
  const db = getServerClient();
  const BATCH_SIZE = 50;
  const batches: Array<Omit<Chunk, "id">>[] = [];
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    batches.push(chunks.slice(i, i + BATCH_SIZE));
  }

  log.info("inserting chunks", {
    totalChunks: chunks.length,
    batches: batches.length,
  });

  await batchAll(
    batches,
    async (batch, index) => {
      return withRetry(
        `insert chunk batch ${index + 1}/${batches.length}`,
        async () => {
          const { error } = await db
            .from("chunks")
            .insert(stripNullBytes(batch));
          if (error) throw error;
        },
      );
    },
    5,
  );
}

type MatchChunksResult = {
  content: string;
  source_type: string;
  source_file: string | null;
  feature_id: string | null;
  similarity: number;
};

export async function matchChunks(
  wikiId: string,
  queryEmbedding: number[],
  params: { matchCount?: number; matchThreshold?: number } = {},
): Promise<MatchChunksResult[]> {
  const { matchCount = 8, matchThreshold = 0.7 } = params;
  const { data, error } = await getServerClient().rpc("match_chunks", {
    query_embedding: queryEmbedding,
    p_wiki_id: wikiId,
    match_count: matchCount,
    match_threshold: matchThreshold,
  });
  if (error) throw error;
  return data || [];
}

/* ─── Wiki Chats ─── */

export async function insertChatMessage(
  wikiId: string,
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  userId?: string,
): Promise<void> {
  const { error } = await getServerClient()
    .from("wiki_chats")
    .insert({
      wiki_id: wikiId,
      session_id: sessionId,
      role,
      content,
      user_id: userId ?? null,
    });
  if (error) throw error;
}

export async function getChatSessionMessages(
  wikiId: string,
  sessionId: string,
  userId?: string,
): Promise<WikiChat[]> {
  let query = getServerClient()
    .from("wiki_chats")
    .select("*")
    .eq("wiki_id", wikiId)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as WikiChat[];
}

export async function getWikiChatSessions(
  wikiId: string,
  userId: string,
): Promise<ChatSession[]> {
  const { data, error } = await getServerClient()
    .from("wiki_chats")
    .select("session_id, role, content, created_at")
    .eq("wiki_id", wikiId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const sessionMap = new Map<
    string,
    { preview: string; last_activity: string; message_count: number }
  >();

  for (const row of data) {
    const existing = sessionMap.get(row.session_id);
    if (!existing) {
      sessionMap.set(row.session_id, {
        preview:
          row.role === "user" ? row.content.slice(0, 80) : "(session started)",
        last_activity: row.created_at,
        message_count: 1,
      });
    } else {
      existing.last_activity = row.created_at;
      existing.message_count += 1;
    }
  }

  return Array.from(sessionMap.entries())
    .map(([session_id, meta]) => ({ session_id, ...meta }))
    .sort(
      (a, b) =>
        new Date(b.last_activity).getTime() -
        new Date(a.last_activity).getTime(),
    );
}

/* ─── Agent Challenges ─── */

export async function getChallengesByWikiId(
  wikiId: string,
): Promise<Challenge[]> {
  const { data, error } = await getServerClient()
    .from("challenges")
    .select("*")
    .eq("wiki_id", wikiId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []) as Challenge[];
}

export async function insertChallenges(
  challenges: Array<Omit<Challenge, "id" | "created_at">>,
): Promise<Challenge[]> {
  const { data, error } = await getServerClient()
    .from("challenges")
    .insert(challenges.map(stripNullBytes))
    .select();

  if (error) throw error;
  return (data || []) as Challenge[];
}
