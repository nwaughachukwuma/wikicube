"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type OptimisticLinkProps = {
  href: string;
  children: React.ReactNode;
  prefetch?: boolean | "auto" | "unstable_forceStale" | null | undefined;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  className?: string;
};

export const OptimLink = ({
  href,
  children,
  prefetch = true,
  onClick,
  className,
}: OptimisticLinkProps) => {
  const router = useRouter();
  const handleMouseEnter = () => {
    router.prefetch(href);
  };
  return (
    <Link
      href={href}
      prefetch={prefetch}
      onMouseEnter={handleMouseEnter}
      onClick={onClick}
      className={className}
    >
      {children}
    </Link>
  );
};
