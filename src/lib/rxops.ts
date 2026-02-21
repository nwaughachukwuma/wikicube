import {
  from,
  lastValueFrom,
  mergeMap,
  toArray,
  type OperatorFunction,
  timeout,
} from "rxjs";

const BATCH = 3;

/**
 * ### Concurrently run an array operation
 * @param arg array to process
 * @param cb async handler
 * @param batchCount # to process concurrently - defaults to 3
 */
export async function asyncMergeMap<T, U>(
  arg: T[],
  cb: (p: T, index: number) => Promise<U>,
  batchCount: number = BATCH,
) {
  return lastValueFrom(
    from(arg.map((item, index) => ({ item, index }))).pipe(
      mergeMap(async (k) => cb(k.item, k.index), batchCount),
      toArray(),
    ),
  );
}

export const timeout$ = (ms = 30000): OperatorFunction<unknown, unknown> =>
  timeout({
    first: 60000,
    each: ms,
    with() {
      throw new Error("Timeout executing batchOps");
    },
  });
