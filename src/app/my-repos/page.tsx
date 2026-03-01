"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/AppHeader";
import { getBrowserClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/supabase/useUser";
import {
  Lock,
  Globe,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PageLoading } from "@/components/PageLoading";
import { fetchWithSWR } from "@/lib/cache.client";
import { OptimLink } from "@/components/OptimisticLink";
import type { RepoWithWiki } from "@/app/api/my-repos/route";
import { dayAgo } from "@/lib/timing";

const PAGE_SIZE = 10;
const CACHE_TTL = 600;

export default function MyReposPage() {
  const router = useRouter();
  const { user, authLoading } = useUser();
  const [repos, setRepos] = useState<RepoWithWiki[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  const signIn = async () => {
    const supabase = getBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        scopes: "repo read:user",
        redirectTo: `${window.location.origin}/api/auth/callback?next=/my-repos`,
      },
    });
  };

  useEffect(() => {
    if (!user) return;

    setReposLoading(true);
    setPage(1);

    // Single server-side call: fetches GitHub repos + wiki check in parallel,
    // with providerToken read from the session cookie, never exposed to client network tab.
    (
      fetchWithSWR(
        "/api/my-repos",
        {},
        { maxAge: CACHE_TTL, userId: user.id },
      ) as Promise<RepoWithWiki[]>
    )
      .then(setRepos)
      .catch((err: Error) => setError(err.message))
      .finally(() => setReposLoading(false));
  }, [user]);

  const totalPages = Math.max(1, Math.ceil(repos.length / PAGE_SIZE));
  const pageRepos = useMemo(
    () => repos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [repos, page],
  );

  if (authLoading) return <PageLoading />;

  return (
    <main className="min-h-screen flex flex-col">
      <AppHeader />

      <div className="flex-1 max-w-3xl w-full mx-auto px-6 py-12">
        <h1 className="font-display text-3xl uppercase tracking-tight">
          My Repos
        </h1>

        {!user ? (
          <div className="mt-12 text-center py-20 border border-border">
            <Lock className="w-8 h-8 mx-auto text-text-muted mb-4" />
            <p className="text-text-muted mb-2">
              Log in with GitHub to view and index your repositories.
            </p>
            <p className="text-xs text-text-muted mb-6">
              We request the{" "}
              <code className="font-mono text-xs bg-bg-alt px-1 py-0.5">
                repo
              </code>{" "}
              scope to read private repos.
            </p>
            <button
              onClick={signIn}
              className="px-6 py-3 bg-text text-bg font-display uppercase text-sm
                         hover:bg-accent hover:text-text transition"
            >
              Log in with GitHub
            </button>
          </div>
        ) : (
          <>
            <p className="mt-2 text-text-muted text-sm">
              Logged in as{" "}
              <span className="font-mono text-text">
                {user.user_metadata?.user_name ?? user.email}
              </span>
            </p>

            {reposLoading && (
              <div className="mt-12 flex items-center gap-2 text-text-muted text-sm">
                <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                Fetching your repositories…
              </div>
            )}

            {error && (
              <div className="mt-8 p-4 border border-red-300 text-sm text-red-600">
                {error.includes("GitHub token") ? (
                  <>
                    GitHub access expired. Please{" "}
                    <button
                      onClick={signIn}
                      className="underline hover:text-red-800"
                    >
                      re-connect your GitHub account
                    </button>
                    .
                  </>
                ) : (
                  error
                )}
              </div>
            )}

            {!reposLoading && !error && repos.length === 0 && (
              <div className="mt-16 text-center py-20 border border-border">
                <p className="text-text-muted">No repositories found.</p>
                <p className="mt-2 text-xs text-text-muted">
                  Create a repo on GitHub, then come back here to generate a
                  wiki for it.
                </p>
              </div>
            )}

            {repos.length > 0 && (
              <>
                <ul className="mt-8 divide-y divide-border border border-border">
                  {pageRepos.map((repo) => (
                    <li
                      key={repo.id}
                      className="flex items-center justify-between px-5 py-4 hover:bg-bg-alt transition"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {repo.private ? (
                            <Lock className="w-3 h-3 text-text-muted shrink-0" />
                          ) : (
                            <Globe className="w-3 h-3 text-text-muted shrink-0" />
                          )}
                          <span className="font-mono text-sm font-medium truncate">
                            {repo.full_name}
                          </span>
                          {repo.language && (
                            <span className="text-[10px] uppercase tracking-wider text-text-muted shrink-0">
                              {repo.language}
                            </span>
                          )}
                        </div>
                        {repo.description && (
                          <p className="mt-0.5 text-xs text-text-muted truncate pl-5">
                            {repo.description}
                          </p>
                        )}
                        <p className="mt-0.5 text-[10px] text-text-muted pl-5">
                          Updated {dayAgo(repo.updated_at)}
                        </p>
                      </div>

                      <div className="flex items-center gap-x-2 shrink-0 ml-4">
                        {repo.hasWiki ? (
                          <OptimLink
                            href={`/wiki/${repo.owner.login}/${repo.name}`}
                            className="px-6 py-1.5 bg-bg-alt border border-border text-sm font-display
                                       capitalize tracking-wide hover:border-border-strong transition"
                          >
                            View Wiki
                          </OptimLink>
                        ) : (
                          <button
                            onClick={() =>
                              router.push(
                                `/wiki/${repo.owner.login}/${repo.name}`,
                              )
                            }
                            className="px-3 py-1.5 cursor-pointer bg-text text-bg text-sm font-display
                                       capitalize tracking-wide hover:bg-accent hover:text-text transition"
                          >
                            Generate Wiki
                          </button>
                        )}

                        <a
                          href={`https://github.com/${repo.full_name}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 border-border hover:bg-neutral-900/10 border text-text-muted hover:text-text transition"
                          aria-label="Open on GitHub"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Pagination */}
                <div className="mt-4 flex items-center justify-between text-xs text-text-muted">
                  <span>
                    {(page - 1) * PAGE_SIZE + 1}–
                    {Math.min(page * PAGE_SIZE, repos.length)} of {repos.length}{" "}
                    repo{repos.length !== 1 ? "s" : ""}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-1 hover:text-text transition disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-2 font-mono">
                      {page} / {totalPages}
                    </span>
                    <button
                      onClick={() =>
                        setPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={page === totalPages}
                      className="p-1 hover:text-text transition disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="Next page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <p className="mt-3 text-xs text-text-muted">
                  Only one member of a shared private repo needs to index it —
                  all collaborators will then be able to access the wiki.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
