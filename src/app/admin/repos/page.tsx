"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import AppHeader from "@/components/AppHeader";
import {
  Lock,
  Globe,
  Trash2,
  RefreshCw,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Wiki } from "@shared/types";

const PAGE_SIZE = 20;

export default function AdminReposPage() {
  const [wikis, setWikis] = useState<Wiki[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState<string | null>(null);
  const [detailWiki, setDetailWiki] = useState<Wiki | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterVisibility, setFilterVisibility] = useState<string>("all");
  const [filterWikiStatus, setFilterWikiStatus] = useState<string>("all");

  const fetchWikis = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/repos", { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to fetch wikis");
      }
      const data = await res.json();
      setWikis(data.wikis || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWikis();
  }, [fetchWikis]);

  const filtered = useMemo(() => {
    return wikis.filter((w) => {
      const q = search.toLowerCase();
      if (q && !`${w.owner}/${w.repo}`.toLowerCase().includes(q)) return false;
      if (filterVisibility !== "all" && w.visibility !== filterVisibility)
        return false;
      if (filterWikiStatus !== "all" && w.status !== filterWikiStatus)
        return false;
      return true;
    });
  }, [wikis, search, filterVisibility, filterWikiStatus]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, filterVisibility, filterWikiStatus]);

  const handleDelete = async (wiki: Wiki) => {
    setDeleting(wiki.id);
    try {
      const res = await fetch(`/api/admin/repos/${wiki.owner}/${wiki.repo}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to delete wiki");
      }
      setWikis((prev) => prev.filter((w) => w.id !== wiki.id));
      setDetailWiki(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(null);
      setConfirmDelete(false);
    }
  };

  const handleReindex = async (wiki: Wiki) => {
    setReindexing(wiki.id);
    try {
      const res = await fetch("/api/reindex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner: wiki.owner, repo: wiki.repo }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Reindex failed");
      }

      const reader = res.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of decoder.decode(value).split("\n")) {
            if (line.startsWith("data: ")) {
              try {
                const evt = JSON.parse(line.slice(6));
                if (evt.type === "done" || evt.type === "error") {
                  await fetchWikis();
                  return;
                }
              } catch {}
            }
          }
        }
      }
      await fetchWikis();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reindex failed");
    } finally {
      setReindexing(null);
    }
  };

  return (
    <main className="min-h-screen flex flex-col">
      <AppHeader />

      <div className="flex-1 max-w-4xl w-full mx-auto px-6 py-12">
        <h1 className="font-display text-3xl uppercase tracking-tight">
          Admin — Indexed Repos
        </h1>

        <p className="mt-2 text-text-muted text-sm">
          {wikis.length} wiki{wikis.length !== 1 ? "s" : ""} indexed
        </p>

        {/* Filters */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search repo…"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-bg-alt border border-border
                         focus:outline-none focus:border-border-strong placeholder:text-text-muted/50"
            />
          </div>
          <select
            value={filterVisibility}
            onChange={(e) => setFilterVisibility(e.target.value)}
            className="px-3 py-1.5 text-xs bg-bg-alt border border-border focus:outline-none"
          >
            <option value="all">All visibility</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
          <select
            value={filterWikiStatus}
            onChange={(e) => setFilterWikiStatus(e.target.value)}
            className="px-3 py-1.5 text-xs bg-bg-alt border border-border focus:outline-none"
          >
            <option value="all">All status</option>
            <option value="done">Done</option>
            <option value="error">Error</option>
            <option value="pending">Pending</option>
            <option value="fetching_tree">Fetching tree</option>
            <option value="identifying_features">Identifying features</option>
            <option value="generating_pages">Generating pages</option>
            <option value="embedding">Embedding</option>
          </select>
        </div>

        {loading && (
          <div className="mt-12 flex items-center gap-2 text-text-muted text-sm">
            <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
            Loading…
          </div>
        )}

        {error && (
          <div className="mt-8 p-4 border border-red-300 text-sm text-red-600">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="mt-16 text-center py-20 border border-border">
            <p className="text-text-muted">
              {wikis.length === 0
                ? "No indexed repositories."
                : "No results match your filters."}
            </p>
          </div>
        )}

        {filtered.length > 0 && (
          <>
            <div className="mt-6 border border-border">
              <table className="w-full text-sm">
                <thead className="bg-bg-alt border-b border-border">
                  <tr>
                    <th className="text-left px-5 py-3 font-display uppercase text-xs tracking-wider text-text-muted">
                      Repo
                    </th>
                    <th className="text-left px-5 py-3 font-display uppercase text-xs tracking-wider text-text-muted">
                      Status
                    </th>
                    <th className="text-left px-5 py-3 font-display uppercase text-xs tracking-wider text-text-muted">
                      Visibility
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pageItems.map((wiki) => (
                    <tr
                      key={wiki.id}
                      onClick={() => setDetailWiki(wiki)}
                      className="hover:bg-bg-alt/50 transition cursor-pointer"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {wiki.visibility === "private" ? (
                            <Lock className="w-3 h-3 text-text-muted shrink-0" />
                          ) : (
                            <Globe className="w-3 h-3 text-text-muted shrink-0" />
                          )}
                          <span className="font-mono font-medium">
                            {wiki.owner}/{wiki.repo}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`text-xs uppercase tracking-wider ${
                            wiki.status === "done"
                              ? "text-green-500"
                              : wiki.status === "error"
                                ? "text-red-500"
                                : "text-text-muted"
                          }`}
                        >
                          {wiki.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-text-muted capitalize">
                        {wiki.visibility}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between text-xs text-text-muted">
              <span>
                {(page - 1) * PAGE_SIZE + 1}–
                {Math.min(page * PAGE_SIZE, filtered.length)} of{" "}
                {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1 hover:text-text transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 font-mono">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1 hover:text-text transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Detail modal */}
      {detailWiki && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border max-w-lg w-full mx-4">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="min-w-0">
                <h2 className="font-display text-sm uppercase tracking-tight text-text-muted">
                  Details
                </h2>
                <p className="font-mono text-base font-medium truncate mt-0.5">
                  {detailWiki.owner}/{detailWiki.repo}
                </p>
              </div>
              <button
                onClick={() => {
                  setDetailWiki(null);
                  setConfirmDelete(false);
                }}
                className="p-1.5 text-text-muted hover:text-text transition shrink-0 ml-4"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Meta grid */}
            <div className="px-6 py-5 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                  Status
                </span>
                <p
                  className={`mt-0.5 text-sm capitalize ${
                    detailWiki.status === "done"
                      ? "text-green-500"
                      : detailWiki.status === "error"
                        ? "text-red-500"
                        : "text-text-muted"
                  }`}
                >
                  {detailWiki.status}
                </p>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                  Visibility
                </span>
                <p className="mt-0.5 text-sm capitalize">
                  {detailWiki.visibility}
                </p>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                  Search
                </span>
                <p className="mt-0.5 text-sm">
                  {detailWiki.search_error ? (
                    <span className="text-red-500">error</span>
                  ) : detailWiki.search_ready ? (
                    <span className="text-green-500">ready</span>
                  ) : (
                    <span className="text-text-muted">pending</span>
                  )}
                </p>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                  Indexed by
                </span>
                <p className="mt-0.5 font-mono text-xs">
                  {detailWiki.indexed_by || "—"}
                </p>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                  Updated
                </span>
                <p className="mt-0.5 text-sm">
                  {new Date(detailWiki.updated_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                  Created
                </span>
                <p className="mt-0.5 text-sm">
                  {new Date(detailWiki.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>

            {detailWiki.search_error && (
              <div className="mx-6 mb-4 px-3 py-2 bg-red-500/5 border border-red-500/20 rounded text-[10px] text-text-muted break-all font-mono leading-relaxed max-h-20 overflow-y-auto">
                {detailWiki.search_error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
              <button
                onClick={() => handleReindex(detailWiki)}
                disabled={reindexing === detailWiki.id}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-xs font-display
                           uppercase tracking-wide hover:border-border-strong transition
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    reindexing === detailWiki.id ? "animate-spin" : ""
                  }`}
                />
                {reindexing === detailWiki.id ? "Reindexing…" : "Reindex"}
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={deleting === detailWiki.id}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-xs font-display
                           uppercase tracking-wide text-red-500 hover:border-red-500/50 transition
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deleting === detailWiki.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && detailWiki && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60">
          <div className="bg-card border border-border p-6 max-w-sm w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg uppercase tracking-tight">
                Delete Wiki
              </h2>
              <button
                onClick={() => setConfirmDelete(false)}
                className="p-1 text-text-muted hover:text-text transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-text-muted mb-2">
              This will permanently delete the wiki, all features, chunks,
              embeddings, and chat history for:
            </p>
            <p className="font-mono text-sm mb-6">
              {detailWiki.owner}/{detailWiki.repo}
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 border border-border text-sm font-display
                           uppercase tracking-wide hover:border-border-strong transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(detailWiki)}
                disabled={deleting === detailWiki.id}
                className="px-4 py-2 bg-red-600 text-white text-sm font-display
                           uppercase tracking-wide hover:bg-red-700 transition
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
