"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { DriverSearchBar } from "@/components/DriverSearchBar";

interface LeagueDetail {
  id: string;
  iracingLeagueId: number | null;
  routeLeagueId: string;
  leagueName: string;
  smallLogo: string | null;
  rosterCount: number | null;
  owner: boolean;
  admin: boolean;
}

export default function LeagueAdminPage() {
  const { session, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const params = useParams<{ leagueId: string }>();

  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !session?.authenticated) {
      router.replace("/");
    }
  }, [authLoading, session, router]);

  useEffect(() => {
    if (!session?.authenticated) return;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/leagues", { cache: "no-store" });
        const data = (await res.json()) as {
          leagues?: LeagueDetail[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "fetch_failed");

        const found =
          data.leagues?.find(
            (l) =>
              l.id === params.leagueId ||
              l.routeLeagueId === params.leagueId ||
              String(l.iracingLeagueId) === params.leagueId,
          ) ?? null;

        if (!found) {
          setError("League not found");
        } else if (!found.owner && !found.admin) {
          setError("You don't have admin access");
        } else {
          setLeague(found);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "error_loading");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [session?.authenticated, params.leagueId]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session?.authenticated) return null;

  const adminSections = [
    {
      title: "Series & Seasons",
      description: "Manage racing series, seasons, and schedules",
      emoji: "🏆",
      href: `/app/${league?.routeLeagueId}/admin/series`,
      stat: 0,
      statLabel: "series",
    },
    {
      title: "Members",
      description: "View and manage league members",
      emoji: "👥",
      href: `/app/${league?.routeLeagueId}/admin/members`,
      stat: 0,
      statLabel: "members",
    },
    {
      title: "Points Systems",
      description: "Create and manage scoring systems",
      emoji: "📊",
      href: `/app/${league?.routeLeagueId}/admin/points-system`,
    },
    {
      title: "Widgets",
      description: "Generate embeddable league widgets",
      emoji: "🔗",
      href: `/app/${league?.routeLeagueId}/admin/widgets`,
    },
    {
      title: "Settings",
      description: "Configure virtual money, recruiting, and more",
      emoji: "⚙️",
      href: `/app/${league?.routeLeagueId}/admin/settings`,
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="text-xl font-black tracking-tight hover:opacity-80 transition-opacity"
          >
            i<span className="text-red-500">Race</span>Hub
          </Link>
          <div className="flex items-center gap-3">
            <DriverSearchBar />
            {league && (
              <Link
                href={`/app/${league.routeLeagueId}`}
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                ← League View
              </Link>
            )}
            <button
              onClick={logout}
              className="rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors px-4 py-1.5 text-sm font-medium text-zinc-300 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        {error && !league ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
            <p className="text-red-400 text-sm mb-4">{error}</p>
            <Link
              href="/dashboard"
              className="text-zinc-400 hover:text-white text-sm"
            >
              ← Back to Dashboard
            </Link>
          </div>
        ) : league ? (
          <>
            {/* League Header */}
            <div className="mb-12">
              <div className="flex items-start gap-4">
                <div className="h-20 w-20 rounded-xl bg-zinc-800 flex items-center justify-center text-3xl">
                  🏁
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h1 className="text-4xl font-black tracking-tight">
                      {league.leagueName}
                    </h1>
                    <span className="rounded-full bg-red-500/10 border border-red-500/30 px-3 py-0.5 text-xs font-semibold text-red-400 uppercase tracking-widest">
                      Admin
                    </span>
                  </div>
                  <p className="text-zinc-400 text-sm">
                    {league.iracingLeagueId
                      ? `iRacing League ID: ${league.iracingLeagueId}`
                      : "Not linked to iRacing"}
                    {league.rosterCount
                      ? ` · ${league.rosterCount} members`
                      : ""}
                  </p>
                  <p className="text-xs text-zinc-500 mt-2">
                    Role:{" "}
                    <span className="text-zinc-300">
                      {league.owner ? "Owner" : "Admin"}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Admin Sections Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
              {adminSections.map((section) => (
                <Link
                  key={section.href}
                  href={section.href}
                  className="group rounded-xl border border-zinc-800 bg-zinc-900 p-6 hover:border-red-500/50 hover:bg-zinc-900/80 transition-all"
                >
                  <div className="text-3xl mb-4">{section.emoji}</div>

                  <h3 className="text-lg font-bold mb-1 group-hover:text-red-400 transition-colors">
                    {section.title}
                  </h3>
                  <p className="text-sm text-zinc-400">{section.description}</p>

                  <div className="mt-4 flex items-center gap-2 text-red-400 text-sm font-medium group-hover:translate-x-1 transition-transform">
                    Go to {section.title} →
                  </div>
                </Link>
              ))}
            </div>

            {/* Quick Links */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-lg font-bold mb-4">Quick Actions</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Link
                  href={`/app/${league.routeLeagueId}/admin/join-requests`}
                  className="flex items-center gap-2 px-4 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
                >
                  <span className="text-sm">Pending Join Requests</span>
                </Link>
                <Link
                  href={`/app/${league.routeLeagueId}/admin/points-system`}
                  className="flex items-center gap-2 px-4 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
                >
                  <span className="text-sm">Create Points System</span>
                </Link>
                <a
                  href="#"
                  className="flex items-center gap-2 px-4 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
                >
                  <span className="text-sm">Documentation & Help</span>
                </a>
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
