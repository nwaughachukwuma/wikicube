const CACHE_NAME = "wikicube-client-cache";
const MAX_AGE = 600; // seconds

type Params<T> = {
  maxAge?: number;
  userId?: string | null;
  onRevalidate?: (data: T) => void;
};

export async function fetchWithSWR<T>(
  url: string,
  options: RequestInit,
  params: Params<T> = {},
) {
  const { maxAge = MAX_AGE, userId, onRevalidate } = params;
  url = userId ? `${url}?uid=${userId}` : url;

  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);
  if (cached) {
    const cachedAt = cached.headers.get("x-cached-at");
    const age = cachedAt ? (Date.now() - Number(cachedAt)) / 1000 : Infinity;
    if (age < maxAge) {
      fetchAndCache<T>(url, options, cache)
        .then((data) => onRevalidate?.(data))
        .catch(() => undefined);
      return cached.json() as T;
    }

    // Do not serve entries beyond the cache window. On auth errors (e.g. an
    // expired GitHub token), purge the entry so the next load also retries.
    return fetchAndCache<T>(url, options, cache).catch(async (error) => {
      await cache.delete(url);
      throw error;
    });
  }

  return fetchAndCache<T>(url, options, cache);
}

async function fetchAndCache<T>(
  url: string,
  options: RequestInit,
  cache: Cache,
) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let message = `Request failed: ${res.statusText}`;
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
  return data as T;
}
