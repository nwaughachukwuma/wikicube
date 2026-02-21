import { createClient } from "./supabase/server";
import type { Wiki, Feature, WikiStatus, Chunk } from "./types";

/* ─── Wikis ─── */

export async function upsertWiki(
  owner: string,
  repo: string,
  defaultBranch: string,
): Promise<Wiki> {
  const db = await createClient();

  // Check if wiki already exists
  const { data: existing } = await db
    .from("wikis")
    .select("*")
    .eq("owner", owner)
    .eq("repo", repo)
    .single();

  if (existing) {
    // Reset for re-generation
    const { data, error } = await db
      .from("wikis")
      .update({
        status: "pending" as WikiStatus,
        default_branch: defaultBranch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;

    // Clear old features and chunks
    await db.from("features").delete().eq("wiki_id", existing.id);
    await db.from("chunks").delete().eq("wiki_id", existing.id);

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
    })
    .select()
    .single();
  if (error) throw error;
  return data as Wiki;
}

export async function updateWikiStatus(
  wikiId: string,
  status: WikiStatus,
  overview?: string,
) {
  const db = await createClient();
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (overview !== undefined) updates.overview = overview;
  const { error } = await db.from("wikis").update(updates).eq("id", wikiId);
  if (error) throw error;
}

export async function getWiki(
  owner: string,
  repo: string,
): Promise<Wiki | null> {
  const db = await createClient();
  const { data } = await db
    .from("wikis")
    .select("*")
    .eq("owner", owner)
    .eq("repo", repo)
    .single();
  return data as Wiki | null;
}

export async function getWikiById(wikiId: string): Promise<Wiki | null> {
  const db = await createClient();
  const { data } = await db.from("wikis").select("*").eq("id", wikiId).single();
  return data as Wiki | null;
}

/* ─── Features ─── */

export async function insertFeature(
  feature: Omit<Feature, "id">,
): Promise<Feature> {
  const db = await createClient();
  const { data, error } = await db
    .from("features")
    .insert(feature)
    .select()
    .single();
  if (error) throw error;
  return data as Feature;
}

export async function getFeatures(wikiId: string): Promise<Feature[]> {
  const db = await createClient();
  const { data, error } = await db
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
  const db = await createClient();
  const { data } = await db
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
  const db = await createClient();
  const batchSize = 50;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const { error } = await db.from("chunks").insert(batch);
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
  const db = await createClient();
  const { data, error } = await db.rpc("match_chunks", {
    query_embedding: queryEmbedding,
    p_wiki_id: wikiId,
    match_count: matchCount,
    match_threshold: matchThreshold,
  });
  if (error) throw error;
  return data || [];
}
