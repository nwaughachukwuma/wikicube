const CACHE_NAME = "wikicube-client-cache";
const MAX_AGE = 600; // seconds

export async function fetchWithSWR(
  url: string,
  options: RequestInit,
  maxAge = MAX_AGE,
) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);

  if (cached) {
    const cachedAt = cached.headers.get("x-cached-at");
    const age = cachedAt ? (Date.now() - Number(cachedAt)) / 1000 : Infinity;
    if (age < maxAge) return cached.json();

    fetchAndCache(url, options, cache); // fire and forget
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
