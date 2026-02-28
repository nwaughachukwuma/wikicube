import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWikiById, matchChunks, getFeatures } from "@/lib/db";
import { generateEmbeddings } from "@/lib/openai";
import { getUserServerClient } from "@/lib/supabase/server";
import { privateWikiGuard } from "@/lib/db.utils";

const SearchSchema = z.object({
  wikiId: z.string().nonempty("wikiId must be a non-empty string"),
  query: z.string().nonempty("query must be a non-empty string"),
});

export async function POST(req: NextRequest) {
  const parsed = SearchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 },
    );
  }

  const { wikiId, query } = parsed.data;

  const wiki = await getWikiById(wikiId);
  if (!wiki || wiki.status !== "done") {
    return NextResponse.json(
      { error: "Wiki not found or not ready" },
      { status: 404 },
    );
  }

  if (wiki.visibility === "private") {
    const supabase = await getUserServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const error = privateWikiGuard(wiki, user?.id);
    if (error) return error;
  }

  // Embed the search query
  const embeddings = await generateEmbeddings([query]);
  if (!embeddings.length || !embeddings[0]?.length) {
    return NextResponse.json(
      { error: "Failed to generate query embedding" },
      { status: 502 },
    );
  }

  // Semantic search
  const chunks = await matchChunks(wikiId, embeddings[0], 10, 0.5);
  // Get features to map feature_id to feature info
  const features = await getFeatures(wikiId);
  const featureMap = new Map(features.map((f) => [f.id, f]));

  const results = chunks.map((chunk) => {
    const feature = chunk.feature_id
      ? featureMap.get(chunk.feature_id as string)
      : null;

    return {
      content: chunk.content.slice(0, 300),
      sourceType: chunk.source_type,
      sourceFile: chunk.source_file,
      similarity: chunk.similarity,
      featureTitle: feature?.title || null,
      featureSlug: feature?.slug || null,
    };
  });

  return NextResponse.json({ results });
}
