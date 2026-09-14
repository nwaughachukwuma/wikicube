"use client";

import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const PARAM = "page";

/**
 * Pagination state backed by the `?page=` URL query param so it survives
 * reloads and navigation. Page 1 is represented by omitting the param.
 */
export function usePageParam() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = Math.max(1, Math.floor(Number(searchParams.get(PARAM))) || 1);

  const setPage = useCallback(
    (value: number) => {
      if (value === page) return;
      const params = new URLSearchParams(searchParams.toString());
      if (value > 1) params.set(PARAM, String(value));
      else params.delete(PARAM);
      const query = params.toString();
      // Shallow update: Next.js syncs useSearchParams with the History API
      // without a server round trip.
      window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    },
    [page, pathname, searchParams],
  );

  return [page, setPage] as const;
}
