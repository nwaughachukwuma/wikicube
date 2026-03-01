"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { OptimLink } from "@/components/OptimisticLink";
import AppHeader from "@/components/AppHeader";
import { PageLoading } from "@/components/PageLoading";
import { useUser } from "@/lib/supabase/useUser";

/** Matches owner/repo or github.com/owner/repo */
const GITHUB_REPO_RE =
  /(?:github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;

const EXAMPLE_REPOS = [
  {
    owner: "Textualize",
    repo: "rich-cli",
    description: "Rich-click: beautiful command line output",
  },
  {
    owner: "browser-use",
    repo: "browser-use",
    description: "AI-powered browser automation framework",
  },
  {
    owner: "tastejs",
    repo: "todomvc",
    description: "TodoMVC: helping you select an MV* framework",
  },
];

export default function HomePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { user, authLoading } = useUser();

  const isValidUrl = useMemo(() => {
    if (!url.trim()) return false;
    const cleaned = url
      .trim()
      .replace(/\/+$/, "")
      .replace(/\.git$/, "");
    return GITHUB_REPO_RE.test(cleaned);
  }, [url]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError("");

    try {
      // Extract owner/repo
      const match = url
        .trim()
        .replace(/\/+$/, "")
        .replace(/\.git$/, "")
        .match(/(?:github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);

      if (!match) {
        setError(
          "Please enter a valid GitHub URL (e.g. github.com/owner/repo)",
        );
        setLoading(false);
        return;
      }

      router.push(`/wiki/${match[1]}/${match[2]}`);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  if (authLoading) return <PageLoading />;

  return (
    <main className="min-h-screen flex flex-col">
      <AppHeader />

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-20">
        <h1 className="font-display text-5xl md:text-7xl lg:text-[5.5rem] text-center uppercase leading-[0.9] tracking-tight max-w-4xl">
          Instant Wiki
          <br />
          <span className="text-text-muted">For Any Repo</span>
        </h1>

        <p className="mt-6 text-lg text-text-muted text-center max-w-xl">
          Paste a GitHub URL and get a polished, AI-generated wiki organized by
          user-facing features. One click. Zero setup.
        </p>

        {/* Input form */}
        <form
          onSubmit={handleSubmit}
          className="mt-10 w-full max-w-xl flex gap-3"
        >
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="github.com/owner/repo"
            className="flex-1 px-4 py-3 bg-card border-2 border-border-strong text-text
                       placeholder:text-text-muted/50 font-mono text-sm
                       focus:outline-none focus:border-text focus:ring-0
                       transition"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !isValidUrl}
            className="px-6 py-3 bg-text text-bg font-display uppercase text-sm tracking-wide
                       hover:bg-accent hover:text-text transition
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "..." : "Generate"}
          </button>
        </form>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <p className="mt-3 text-xs text-text-muted text-center">
          <OptimLink href="/my-repos" className="underline hover:text-text">
            Index your own repos
          </OptimLink>
        </p>

        {/* Example repos */}
        <div className="mt-16 w-full max-w-3xl">
          <p className="text-xs uppercase tracking-widest text-text-muted mb-4 text-center">
            Try an example
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {EXAMPLE_REPOS.map((example) => (
              <OptimLink
                key={`${example.owner}/${example.repo}`}
                href={`/wiki/${example.owner}/${example.repo}`}
                className="text-left p-4 border border-border hover:border-border-strong
                           hover:bg-card transition group"
              >
                <div className="font-mono text-sm font-medium group-hover:text-text">
                  {example.owner}/{example.repo}
                </div>
                <div className="mt-1 text-xs text-text-muted">
                  {example.description}
                </div>
              </OptimLink>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-4 text-center text-xs text-text-muted">
        Built for the Cubic coding challenge — powered by OpenAI & Supabase
      </footer>
    </main>
  );
}
