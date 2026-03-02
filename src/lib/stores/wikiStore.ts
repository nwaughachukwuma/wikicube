import { create } from "zustand";
import type { Feature, Wiki } from "../types";
import { fetchWithSWR } from "../cache.client";

export interface WikiData {
  wiki: Wiki;
  features: Feature[];
}

interface FileStore {
  data: WikiData | null;
  loading: boolean;
  getWikiData: (owner: string, repo: string) => Promise<WikiData | void>;
  pollWikiData: (owner: string, repo: string) => () => void;
  refetch: (owner: string, repo: string) => boolean;
}

export const wikiStore = create<FileStore>((set, get) => ({
  data: null,
  loading: false,
  refetch: (owner, repo) => {
    const { data } = get();
    return !data || data.wiki.owner !== owner || data.wiki.repo !== repo;
  },
  getWikiData: async (owner, repo) => {
    if (!get().refetch(owner, repo)) return;
    set({ loading: true });
    return fetchWithSWR<WikiData>(
      `${location.origin}/api/wiki/${owner}/${repo}`,
      {},
      { maxAge: 86_400, userId: null },
    )
      .then((res) => {
        if (res.wiki?.status === "done") {
          set({ data: res });
          return res;
        }
      })
      .finally(() => set({ loading: false }));
  },
  pollWikiData: (owner, repo) => {
    const interval = setInterval(async () => {
      await fetch(`/api/wiki/${owner}/${repo}`)
        .then((res) => {
          if (res.ok) return res.json() as Promise<WikiData>;
          return null;
        })
        .then((data) => {
          if (data?.wiki?.search_ready) {
            set({ data });
            clearInterval(interval);
          }
        });
    }, 5_000);

    return () => clearInterval(interval);
  },
}));
