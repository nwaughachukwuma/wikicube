import { describe, it, expect, vi } from "vitest";
import * as supabase from "./supabase.js";
import { getWiki, getWikiById, upsertWiki } from "./db.js";

vi.mock("./supabase.js", () => ({
  getServerClient: vi.fn(),
  getSupabaseUser: vi.fn(),
}));

const wiki = {
  id: "wiki-1",
  owner: "marcelroed",
  repo: "gigatoken",
  default_branch: "main",
  overview: "",
  status: "done",
  visibility: "public",
  indexed_by: null,
  search_ready: true,
  search_error: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

function makeSelectChain(finalResult: { data?: any; error?: any }) {
  const single = vi.fn().mockResolvedValue(finalResult);
  const eq = vi.fn(() => ({ eq, single }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from, select, eq, single, client: { from } };
}

function makeInsertChain(finalResult: { data?: any; error?: any }) {
  const single = vi.fn().mockResolvedValue(finalResult);
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  return { from, insert, select, single, client: { from } };
}

describe("getWiki", () => {
  it("returns a wiki when it exists", async () => {
    const { client } = makeSelectChain({ data: wiki });
    vi.mocked(supabase.getServerClient).mockReturnValue(client as any);

    const result = await getWiki("marcelroed", "gigatoken");
    expect(result).toEqual(wiki);
  });

  it("returns null when the wiki does not exist", async () => {
    const { client } = makeSelectChain({ data: null });
    vi.mocked(supabase.getServerClient).mockReturnValue(client as any);

    const result = await getWiki("missing", "repo");
    expect(result).toBeNull();
  });
});

describe("getWikiById", () => {
  it("returns a wiki by id", async () => {
    const { client } = makeSelectChain({ data: wiki });
    vi.mocked(supabase.getServerClient).mockReturnValue(client as any);

    const result = await getWikiById("wiki-1");
    expect(result).toEqual(wiki);
  });
});

describe("upsertWiki", () => {
  it("returns the existing wiki when it is already done", async () => {
    const { client } = makeSelectChain({ data: wiki });
    vi.mocked(supabase.getServerClient).mockReturnValue(client as any);

    const result = await upsertWiki("marcelroed", "gigatoken", "main");
    expect(result).toEqual(wiki);
  });

  it("creates a new wiki when none exists", async () => {
    const selectChain = makeSelectChain({ data: null, error: null });
    const insertChain = makeInsertChain({ data: wiki, error: null });

    const client = {
      from: (table: string) => {
        if (table === "wikis") {
          return {
            ...selectChain.from(),
            ...insertChain.from(),
          };
        }
        return { delete: () => ({ eq: () => Promise.resolve({ error: null }) }) };
      },
    };
    vi.mocked(supabase.getServerClient).mockReturnValue(client as any);

    const result = await upsertWiki("marcelroed", "gigatoken", "main");
    expect(result).toEqual(wiki);
  });
});
