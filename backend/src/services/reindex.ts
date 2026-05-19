import { ensureError } from "@shared/error.js";
import type { Feature, Wiki } from "@shared/types.js";
import { markSearchFailed, deleteChunks, getFeatures } from "./db.js";
import { embedWikiAndCode } from "../utils/code-analyzer/embedder.js";
import { getMultipleFiles } from "@shared/github.js";
import { logger } from "@shared/logger.js";

const log = logger("repo:reindexWikiAndCode");

export async function reindexWikiAndCode(wiki: Wiki, githubToken?: string) {
  log.info("Rebuilding search index...", {
    type: "status",
    status: "embedding",
  });
  const features = await getFeatures(wiki.id);

  // delete previous partial chunks
  await deleteChunks(wiki.id);

  const sourceFiles = await getSourceFiles(wiki, features, githubToken);

  await embedWikiAndCode({
    wikiId: wiki.id,
    features,
    sourceFiles,
    overview: wiki.overview,
    onEvent: () => {},
  }).catch(async (err) => {
    const normalizedError = ensureError(err, "Background embedding failed");
    log.error("Background embedding failed", {
      wikiId: wiki.id,
      error: normalizedError.message,
      stack: normalizedError.stack,
    });

    await markSearchFailed(wiki.id, normalizedError.message);

    throw normalizedError;
  });

  return wiki.id;
}

// Collect unique source file paths from feature citations and entry points
async function getSourceFiles(wiki: Wiki, features: Feature[], githubToken?: string) {
  const filePaths = new Set<string>();
  for (const feature of features) {
    for (const citation of feature.citations) {
      if (citation.file) filePaths.add(citation.file);
    }
    for (const entryPoint of feature.entry_points) {
      if (entryPoint.file) filePaths.add(entryPoint.file);
    }
  }

  // Fetch source file contents from GitHub
  let sourceFiles = new Map<string, string>();
  if (filePaths.size > 0) {
    log.info("Fetching source files for reindex", {
      wikiId: wiki.id,
      fileCount: filePaths.size,
    });
    sourceFiles = await getMultipleFiles(
      wiki.owner,
      wiki.repo,
      wiki.default_branch,
      Array.from(filePaths),
      githubToken
    );
    log.info("Source files fetched", {
      wikiId: wiki.id,
      fetchedCount: sourceFiles.size,
    });
  }

  return sourceFiles;
}
