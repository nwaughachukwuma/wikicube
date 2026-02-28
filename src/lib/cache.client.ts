const CACHE_NAME = "wikicube-client-cache";
const MAX_AGE = 600; // seconds

type Params = {
  maxAge?: number;
  userId?: string | null;
};

export async function fetchWithSWR(
  url: string,
  options: RequestInit,
  params: Params = {},
) {
  const { maxAge = MAX_AGE, userId } = params;
  url = userId ? `${url}?uid=${userId}` : url;

  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);
  if (cached) {
    const cachedAt = cached.headers.get("x-cached-at");
    const age = cachedAt ? (Date.now() - Number(cachedAt)) / 1000 : Infinity;
    if (age < maxAge) return cached.json();

    // On auth errors (e.g. expired GitHub token → 403)
    // purge the entry so the *next* load surfaces the error
    // immediately instead of endlessly serving stale data.
    fetchAndCache(url, options, cache).catch(
      async () => await cache.delete(url),
    );
    return cached.json();
  }

  return fetchAndCache(url, options, cache);
}

async function fetchAndCache(url: string, options: RequestInit, cache: Cache) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {}
    throw new Error(message);
  }

  const data = await res.json();
  const syntheticResponse = new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json",
      "x-cached-at": String(Date.now()),
    },
  });
  await cache.put(url, syntheticResponse);
  return data;
}
