"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const PARAM = "page";

/**
 * Pagination state backed by the `?page=` URL query param so it survives
 * reloads and navigation. Page 1 is represented by omitting the param.
 */
export function usePageParam() {
  const router = useRouter();
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
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [page, pathname, router, searchParams],
  );

  return [page, setPage] as const;
}
