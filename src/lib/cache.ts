import { unstable_cache } from "next/cache";
import { getWiki, getFeatures } from "./db";

export const getCachedWiki = unstable_cache(
  async (owner: string, repo: string) => getWiki(owner, repo),
  ["wiki"],
  { revalidate: 3600 },
);

export const getCachedFeatures = unstable_cache(
  async (wikiId: string) => getFeatures(wikiId),
  ["features"],
  { revalidate: 3600 },
);
