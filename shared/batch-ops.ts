const DEFAULT_CONCURRENCY = 3;

/**
 * Concurrently map over an array with a concurrency limit.
 * Results are returned **in input order**
 *
 * @param items  - array to process
 * @param fn     - async handler receiving each item and its index
 * @param concurrency - max parallel tasks (default 3)
 */
export async function batchAll<T, U>(
  items: T[],
  fn: (item: T, index: number) => Promise<U>,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<U[]> {
  if (items.length === 0) return [];

  const results: U[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
