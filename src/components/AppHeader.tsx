"use client";

import { OptimLink } from "@/components/OptimisticLink";
import WikiHistoryPanel from "@/components/WikiHistoryPanel";
import AuthButton from "@/components/AuthButton";

interface Props {
  /** Extra right-side content before AuthButton */
  children?: React.ReactNode;
}

export default function AppHeader({ children }: Props) {
  return (
    <header className="border-b border-border px-6 py-4 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <WikiHistoryPanel />
        <OptimLink
          href="/"
          className="font-display text-xl uppercase tracking-tight hover:text-text-muted transition"
        >
          WikiCube
        </OptimLink>
      </div>

      <div className="flex items-center gap-4">
        {children}

        <a
          href="https://github.com/nwaughachukwuma/wikicube"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-text-muted hover:text-text transition"
        >
          GitHub
        </a>

        <AuthButton />
      </div>
    </header>
  );
}
