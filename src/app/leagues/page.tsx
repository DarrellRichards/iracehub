"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface LeagueItem {
  id: string;
  iracingLeagueId: number;
  leagueName: string;
  smallLogo: string | null;
  rosterCount: number | null;
  recruiting: boolean | null;
  privateSchedule: boolean | null;
  privateResults: boolean | null;
  virtualModeEnabled: boolean;
  createdAtIracing: string | null;
  createdAt: string;
}

interface DiscoverResponse {
  leagues: LeagueItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  search: string;
}

const PAGE_SIZE = 12;

export default function LeaguesPage() {
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DiscoverResponse | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQuery(searchInput.trim());
      setPage(1);
    }, 250);

    return () => clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
        });

        if (query) {
          params.set("search", query);
        }

        const response = await fetch(
          `/api/leagues/discover?${params.toString()}`,
          {
            cache: "no-store",
          },
        );

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
            message?: string;
          } | null;
          throw new Error(
            payload?.message ?? payload?.error ?? "failed_to_load_leagues",
          );
        }

        const payload = (await response.json()) as DiscoverResponse;
        if (!cancelled) {
          setData(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "failed_to_load_leagues",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [page, query]);

  const leagues = data?.leagues ?? [];
  const pagination = data?.pagination;

  const pageNumbers = useMemo(() => {
    if (!pagination) return [];

    const start = Math.max(1, pagination.page - 2);
    const end = Math.min(pagination.totalPages, pagination.page + 2);
    const pages: number[] = [];

    for (let current = start; current <= end; current += 1) {
      pages.push(current);
    }

    return pages;
  }, [pagination]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link
            href="/"
            className="text-2xl font-black tracking-tight text-white"
          >
            i<span className="text-red-500">Race</span>Hub
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-500"
          >
            Back Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight">All Leagues</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Browse league information, search by name or iRacing League ID,
              and explore available communities.
            </p>
          </div>

          <div className="w-full sm:max-w-sm">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Search leagues
            </label>
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Name or iRacing ID"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-red-500"
            />
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
          </div>
        ) : leagues.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-10 text-center">
            <p className="text-zinc-300">No leagues found.</p>
            <p className="mt-2 text-sm text-zinc-500">
              Try a different search term.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm text-zinc-500">
              Showing <span className="text-zinc-300">{leagues.length}</span> of{" "}
              <span className="text-zinc-300">
                {pagination?.totalCount ?? leagues.length}
              </span>{" "}
              leagues
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {leagues.map((league) => (
                <article
                  key={league.id}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
                >
                  <div className="mb-4 flex items-start gap-3">
                    {league.smallLogo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={league.smallLogo}
                        alt={`${league.leagueName} logo`}
                        className="h-12 w-12 rounded-md border border-zinc-700 object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-md border border-zinc-700 bg-zinc-950 text-sm text-zinc-500">
                        🏁
                      </div>
                    )}
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-bold text-white">
                        {league.leagueName}
                      </h2>
                      <p className="text-xs text-zinc-500">
                        iRacing League ID: {league.iracingLeagueId}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1 text-sm text-zinc-400">
                    <p>
                      Members:{" "}
                      <span className="text-zinc-200">
                        {league.rosterCount ?? "Unknown"}
                      </span>
                    </p>
                    <p>
                      Recruiting:{" "}
                      <span className="text-zinc-200">
                        {league.recruiting ? "Open" : "Closed"}
                      </span>
                    </p>
                    <p>
                      Virtual Money:{" "}
                      <span className="text-zinc-200">
                        {league.virtualModeEnabled ? "Enabled" : "Disabled"}
                      </span>
                    </p>
                    <p>
                      Privacy:{" "}
                      <span className="text-zinc-200">
                        {league.privateSchedule || league.privateResults
                          ? "Restricted"
                          : "Public"}
                      </span>
                    </p>
                  </div>
                </article>
              ))}
            </div>

            {pagination && pagination.totalPages > 1 && (
              <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={!pagination.hasPreviousPage}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Prev
                </button>

                {pageNumbers.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => setPage(pageNumber)}
                    className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                      pageNumber === pagination.page
                        ? "border-red-500 bg-red-500/20 text-red-300"
                        : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                    }`}
                  >
                    {pageNumber}
                  </button>
                ))}

                <button
                  type="button"
                  disabled={!pagination.hasNextPage}
                  onClick={() => setPage((current) => current + 1)}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
