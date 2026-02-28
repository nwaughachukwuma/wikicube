import { batchAll } from "./batchOps";
import { logger } from "./logger";
import { getServerClient } from "./supabase/server";
import type {
  Wiki,
  Feature,
  WikiStatus,
  Chunk,
  WikiChat,
  ChatSession,
} from "./types";

const log = logger("db");

/**
 * Strip PostgreSQL-incompatible null bytes from all string values in an object
 */
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

  // Check if wiki already exists
  const { data: existing } = await db
    .from("wikis")
    .select("*")
    .eq("owner", owner)
    .eq("repo", repo)
    .single();

  if (existing) {
    // Return if already done
    if (existing.status === "done") {
      log.info("wiki already done", {
        wikiId: existing.id,
        owner,
        repo,
      });
      return existing as Wiki;
    }

    // Reset for re-generation
    log.info("resetting existing wiki", { wikiId: existing.id, owner, repo });
    const { data, error } = await db
      .from("wikis")
      .update({
        status: "pending" as WikiStatus,
        default_branch: defaultBranch,
        visibility: opts.visibility ?? existing.visibility ?? "public",
        indexed_by: opts.indexedBy ?? existing.indexed_by ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) throw error;

    // Clear old features and chunks in parallel
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

  if (overview !== undefined) {
    updates.overview = stripNullBytes(overview);
  }

  const { error } = await getServerClient()
    .from("wikis")
    .update(stripNullBytes(updates))
    .eq("id", wikiId);

  if (error) throw error;
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

export async function getFeatures(wikiId: string): Promise<Feature[]> {
  const { data, error } = await getServerClient()
    .from("features")
    .select("*")
    .eq("wiki_id", wikiId)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  return (data || []) as Feature[];
}

export async function getFeatureBySlug(
  wikiId: string,
  slug: string,
): Promise<Feature | null> {
  const { data } = await getServerClient()
    .from("features")
    .select("*")
    .eq("wiki_id", wikiId)
    .eq("slug", slug)
    .single();

  return data as Feature | null;
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

  const results = await batchAll(
    batches,
    async (batch) => {
      try {
        return db.from("chunks").insert(stripNullBytes(batch));
      } catch (error) {
        return { error };
      }
    },
    5,
  );

  for (const { error } of results) {
    if (error) throw error;
  }
}

export async function matchChunks(
  wikiId: string,
  queryEmbedding: number[],
  matchCount = 8,
  matchThreshold = 0.7,
): Promise<
  Array<{
    content: string;
    source_type: string;
    source_file: string | null;
    feature_id: string | null;
    similarity: number;
  }>
> {
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

  // Group by session_id, derive preview + last_activity + count
  const sessionMap = new Map<
    string,
    { preview: string; last_activity: string; message_count: number }
  >();

  for (const row of data) {
    const existing = sessionMap.get(row.session_id);
    if (!existing) {
      // First message for this session — use as preview if it's a user message
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

  // Return most-recent-first
  return Array.from(sessionMap.entries())
    .map(([session_id, meta]) => ({ session_id, ...meta }))
    .sort(
      (a, b) =>
        new Date(b.last_activity).getTime() -
        new Date(a.last_activity).getTime(),
    );
}
