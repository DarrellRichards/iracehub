"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";

interface DriverResult {
  custId: number;
  displayName: string;
  country: string | null;
  memberSince: string | null;
  leagueCount: number;
}

function DriverCard({ driver }: { driver: DriverResult }) {
  const year = driver.memberSince
    ? new Date(driver.memberSince).getFullYear()
    : null;

  return (
    <Link
      href={`/app/drivers/${driver.custId}`}
      className="group flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 transition-all hover:border-zinc-600 hover:bg-zinc-900"
    >
      {/* Avatar placeholder */}
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-lg font-black text-zinc-400 group-hover:border-zinc-500">
          {(driver.displayName[0] ?? "#").toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate font-bold text-white group-hover:text-red-300 transition-colors">
            {driver.displayName}
          </p>
          <p className="text-xs text-zinc-500">iRacing #{driver.custId}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {driver.country && (
          <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-0.5 text-[11px] text-zinc-400">
            {driver.country}
          </span>
        )}
        {year && (
          <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-0.5 text-[11px] text-zinc-400">
            Member since {year}
          </span>
        )}
        {driver.leagueCount > 0 && (
          <span className="rounded-full border border-emerald-800/40 bg-emerald-950/30 px-2.5 py-0.5 text-[11px] text-emerald-400">
            {driver.leagueCount} league{driver.leagueCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="mt-auto text-right text-xs font-semibold text-zinc-500 group-hover:text-red-400 transition-colors">
        View Passport →
      </div>
    </Link>
  );
}

export default function DriversSearchPage() {
  const { session, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";

  const [query, setQuery] = useState(initialQ);
  const [results, setResults] = useState<DriverResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!authLoading && !session?.authenticated) {
      router.replace("/");
    }
  }, [authLoading, session, router]);

  const search = useCallback(async (q: string) => {
    setSearching(true);
    setError(null);
    try {
      const url = `/api/drivers?q=${encodeURIComponent(q)}&limit=48`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        const payload = (await res.json()) as { error?: string };
        throw new Error(payload.error ?? `search_failed_${res.status}`);
      }
      const data = (await res.json()) as { results: DriverResult[] };
      setResults(data.results);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "search_failed");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // Run initial search from URL query param (e.g. when DriverSearchBar navigates here)
  useEffect(() => {
    if (!initialQ.trim() || !session?.authenticated) return;

    const timer = setTimeout(() => {
      void search(initialQ.trim());
    }, 0);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ, session?.authenticated]);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (val.trim().length === 0) {
      // Clear on empty — or fetch all
      setResults([]);
      setSearched(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      void search(val.trim());
    }, 350);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim()) void search(query.trim());
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session?.authenticated) return null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="text-xl font-black tracking-tight hover:opacity-80 transition-opacity"
          >
            i<span className="text-red-500">Race</span>Hub
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        {/* Hero */}
        <div className="mb-10">
          <span className="inline-block rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-red-300 mb-4">
            Driver Search
          </span>
          <h1 className="text-4xl font-black tracking-tight mb-3">
            Find a Driver
          </h1>
          <p className="text-zinc-400 max-w-xl">
            Search by name, nickname, car number, or iRacing ID. Click any card
            to open their Driver Passport.
          </p>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSubmit} className="mb-10">
          <div className="relative flex items-center max-w-2xl">
            <span className="absolute left-4 text-zinc-500 pointer-events-none">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-5 w-5"
              >
                <path
                  fillRule="evenodd"
                  d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
            <input
              autoFocus
              type="search"
              value={query}
              onChange={handleInput}
              placeholder="Name, nickname, car #, or iRacing ID…"
              className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 py-4 pl-12 pr-32 text-base text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-red-500"
            />
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="absolute right-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-red-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
        </form>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-900/50 bg-red-950/20 px-5 py-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Results */}
        {searching && (
          <div className="flex items-center gap-3 text-sm text-zinc-500 py-12 justify-center">
            <div className="h-5 w-5 rounded-full border-2 border-zinc-600 border-t-transparent animate-spin" />
            Searching…
          </div>
        )}

        {!searching && searched && results.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-16 text-center">
            <p className="text-zinc-500 text-sm">
              No drivers found for{" "}
              <span className="text-zinc-300 font-semibold">
                &ldquo;{query}&rdquo;
              </span>
              .
            </p>
            <p className="text-zinc-600 text-xs mt-2">
              Try a different name, nickname, or paste their iRacing ID
              directly.
            </p>
          </div>
        )}

        {!searching && results.length > 0 && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-zinc-500">
                {results.length} driver{results.length === 1 ? "" : "s"} found
                {query ? (
                  <>
                    {" "}
                    for{" "}
                    <span className="text-zinc-300 font-semibold">
                      &ldquo;{query}&rdquo;
                    </span>
                  </>
                ) : null}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {results.map((driver) => (
                <DriverCard key={driver.custId} driver={driver} />
              ))}
            </div>
          </>
        )}

        {!searched && !searching && (
          <div className="rounded-2xl border border-dashed border-zinc-800 px-6 py-16 text-center">
            <div className="text-5xl mb-4">🏁</div>
            <p className="text-zinc-400 text-sm">
              Start typing to search for a driver by name, car number, or
              iRacing ID.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
