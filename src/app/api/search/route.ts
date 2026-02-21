import { NextRequest, NextResponse } from "next/server";
import { getWikiById, matchChunks, getFeatures } from "@/lib/db";
import { generateEmbeddings } from "@/lib/openai";

export async function POST(req: NextRequest) {
  try {
    const { wikiId, query } = await req.json();

    if (!wikiId || !query) {
      return NextResponse.json(
        { error: "wikiId and query are required" },
        { status: 400 },
      );
    }

    const wiki = await getWikiById(wikiId);
    if (!wiki || wiki.status !== "done") {
      return NextResponse.json(
        { error: "Wiki not found or not ready" },
        { status: 404 },
      );
    }

    // Embed the search query
    const [queryEmbedding] = await generateEmbeddings([query]);

    // Semantic search
    const chunks = await matchChunks(wikiId, queryEmbedding, 10, 0.5);

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
  } catch (err) {
    console.error("Search API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
