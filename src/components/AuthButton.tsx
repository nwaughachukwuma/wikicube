"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogOut, BookMarked } from "lucide-react";
import { getBrowserClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/supabase/useUser";

export default function AuthButton() {
  const { user, authLoading } = useUser();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const signIn = async () => {
    await getBrowserClient().auth.signInWithOAuth({
      provider: "github",
      options: {
        scopes: "repo read:user",
        redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(window.location.pathname)}`,
      },
    });
  };

  const signOut = async () => {
    setOpen(false);
    await getBrowserClient().auth.signOut();
    window.location.reload();
  };

  if (authLoading) return <div className="w-6 h-6" />;

  if (!user) {
    return (
      <button
        onClick={signIn}
        className="text-sm text-text-muted hover:text-text transition"
      >
        Log in
      </button>
    );
  }

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
  const login = user.user_metadata?.user_name as string | undefined;
  const email = user.email ?? "";
  const initial = (login ?? email ?? "?").slice(0, 1).toUpperCase();

  return (
    <div ref={containerRef} className="relative">
      {/* Avatar trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex items-center rounded-full focus:outline-none
                   ring-offset-1 focus-visible:ring-2 focus-visible:ring-text"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={login ?? "avatar"}
            className="w-7 h-7 rounded-full border-2 border-transparent
                       hover:border-text transition"
          />
        ) : (
          <div
            className="w-7 h-7 rounded-full bg-accent flex items-center justify-center
                       text-[11px] font-display uppercase text-text border-2
                       border-transparent hover:border-text transition"
          >
            {initial}
          </div>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-52 bg-card border border-border
                     shadow-lg z-50 py-1"
        >
          {/* Identity */}
          <div className="px-4 py-3 border-b border-border">
            {login && (
              <p className="text-sm font-medium text-text truncate">@{login}</p>
            )}
            {email && (
              <p className="text-xs text-text-muted truncate">{email}</p>
            )}
          </div>

          {/* Nav items */}
          <Link
            href="/my-repos"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm
                       text-text-muted hover:text-text hover:bg-bg-alt transition"
          >
            <BookMarked className="w-3.5 h-3.5 shrink-0" />
            My Repos
          </Link>

          <div className="border-t border-border mt-1" />

          <button
            onClick={signOut}
            className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm
                       text-text-muted hover:text-text hover:bg-bg-alt transition"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
