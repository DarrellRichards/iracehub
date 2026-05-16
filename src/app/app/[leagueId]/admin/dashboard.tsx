"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { DriverSearchBar } from "@/components/DriverSearchBar";
import {
  Trophy,
  Users,
  Grid,
  Share2,
  Settings,
  ExternalLink,
} from "lucide-react";

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

interface AdminStats {
  seriesCount: number;
  memberCount: number;
  pendingJoinRequests: number;
}

export default function AdminDashboard() {
  const { session, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const params = useParams<{ leagueId: string }>();

  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [stats, setStats] = useState<AdminStats>({
    seriesCount: 0,
    memberCount: 0,
    pendingJoinRequests: 0,
  });
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

          // Load stats
          const [seriesRes, membersRes, joinReqRes] = await Promise.all([
            fetch(`/api/leagues/${found.id}/series`, { cache: "no-store" }),
            fetch(`/api/leagues/${found.id}/members`, { cache: "no-store" }),
            fetch(`/api/leagues/${found.id}/join-requests`, {
              cache: "no-store",
            }),
          ]);

          const seriesData = seriesRes.ok ? await seriesRes.json() : [];
          const membersData = membersRes.ok ? await membersRes.json() : [];
          const joinReqData = joinReqRes.ok ? await joinReqRes.json() : [];

          setStats({
            seriesCount: Array.isArray(seriesData) ? seriesData.length : 0,
            memberCount: Array.isArray(membersData) ? membersData.length : 0,
            pendingJoinRequests: Array.isArray(joinReqData)
              ? joinReqData.filter(
                  (r: { status: string }) => r.status === "PENDING",
                ).length
              : 0,
          });
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
      icon: Trophy,
      href: `/app/${league?.routeLeagueId}/admin/series`,
      stat: stats.seriesCount,
      statLabel: "series",
    },
    {
      title: "Members",
      description: "View and manage league members",
      icon: Users,
      href: `/app/${league?.routeLeagueId}/admin/members`,
      stat: stats.memberCount,
      statLabel: "members",
      badge:
        stats.pendingJoinRequests > 0 ? stats.pendingJoinRequests : undefined,
    },
    {
      title: "Points Systems",
      description: "Create and manage scoring systems",
      icon: Grid,
      href: `/app/${league?.routeLeagueId}/admin/points-system`,
    },
    {
      title: "Widgets",
      description: "Generate embeddable league widgets",
      icon: Share2,
      href: `/app/${league?.routeLeagueId}/admin/widgets`,
    },
    {
      title: "Settings",
      description: "Configure virtual money, recruiting, and more",
      icon: Settings,
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
                {league.smallLogo ? (
                  <Image
                    src={league.smallLogo}
                    alt={league.leagueName}
                    width={80}
                    height={80}
                    unoptimized
                    className="h-20 w-20 rounded-xl object-cover border border-zinc-800"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-xl bg-zinc-800 flex items-center justify-center text-3xl">
                    🏁
                  </div>
                )}
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {adminSections.map((section) => {
                const Icon = section.icon;
                return (
                  <Link
                    key={section.href}
                    href={section.href}
                    className="group rounded-xl border border-zinc-800 bg-zinc-900 p-6 hover:border-red-500/50 hover:bg-zinc-900/80 transition-all"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 group-hover:bg-red-500/20 transition-colors">
                        <Icon className="w-5 h-5 text-red-400" />
                      </div>
                      {section.badge && (
                        <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold">
                          {section.badge}
                        </span>
                      )}
                    </div>

                    <h3 className="text-lg font-bold mb-1 group-hover:text-red-400 transition-colors">
                      {section.title}
                    </h3>
                    <p className="text-sm text-zinc-400 mb-4">
                      {section.description}
                    </p>

                    {section.stat !== undefined && (
                      <div className="pt-4 border-t border-zinc-800">
                        <p className="text-xs text-zinc-500 uppercase tracking-wider">
                          {section.statLabel}
                        </p>
                        <p className="text-2xl font-bold text-white mt-1">
                          {section.stat}
                        </p>
                      </div>
                    )}

                    <div className="mt-4 flex items-center gap-2 text-red-400 text-sm font-medium group-hover:translate-x-1 transition-transform">
                      Go to {section.title} <ExternalLink className="w-3 h-3" />
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Quick Links */}
            <div className="mt-12 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-lg font-bold mb-4">Quick Actions</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Link
                  href={`/app/${league.routeLeagueId}/admin/join-requests`}
                  className="flex items-center gap-2 px-4 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
                >
                  <span className="text-sm">Pending Join Requests</span>
                  {stats.pendingJoinRequests > 0 && (
                    <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-semibold">
                      {stats.pendingJoinRequests}
                    </span>
                  )}
                </Link>
                <a
                  href={`/app/${league.routeLeagueId}/admin/points-system`}
                  className="flex items-center gap-2 px-4 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
                >
                  <span className="text-sm">Create Points System</span>
                </a>
                <a
                  href="#"
                  className="flex items-center gap-2 px-4 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
                >
                  <span className="text-sm">View Documentation</span>
                </a>
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
