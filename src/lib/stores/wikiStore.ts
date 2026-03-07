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
}

export const wikiStore = create<FileStore>((set) => ({
  data: null,
  loading: false,
  getWikiData: async (owner, repo) => {
    set({ loading: true });
    return fetchWithSWR<WikiData>(
      `/api/wiki/${owner}/${repo}`,
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
          if (data?.wiki.search_ready || data?.wiki.search_error) {
            set({ data });
            clearInterval(interval);
          }
        });
    }, 5_000);

    return () => clearInterval(interval);
  },
}));
