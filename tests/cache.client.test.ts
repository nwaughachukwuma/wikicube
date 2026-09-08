import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithSWR } from "@/lib/cache.client";

describe("fetchWithSWR", () => {
  const entries = new Map<string, Response>();

  beforeEach(() => {
    entries.clear();
    vi.stubGlobal("caches", {
      open: vi.fn().mockResolvedValue({
        match: async (url: string) => entries.get(url)?.clone(),
        put: async (url: string, response: Response) =>
          entries.set(url, response.clone()),
        delete: async (url: string) => entries.delete(url),
      }),
    });
  });

  it("serves a fresh cached response and revalidates it in the background", async () => {
    entries.set(
      "/api/wikis",
      new Response(JSON.stringify(["cached"]), {
        headers: { "x-cached-at": String(Date.now()) },
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json(["updated"])),
    );
    const onRevalidate = vi.fn();

    await expect(
      fetchWithSWR<string[]>("/api/wikis", {}, { maxAge: 300, onRevalidate }),
    ).resolves.toEqual(["cached"]);
    await vi.waitFor(() => expect(onRevalidate).toHaveBeenCalledWith(["updated"]));
  });

  it("fetches a new response instead of serving cache beyond the window", async () => {
    entries.set(
      "/api/wikis",
      new Response(JSON.stringify(["expired"]), {
        headers: { "x-cached-at": String(Date.now() - 301_000) },
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json(["updated"])),
    );

    await expect(
      fetchWithSWR<string[]>("/api/wikis", {}, { maxAge: 300 }),
    ).resolves.toEqual(["updated"]);
  });
});
