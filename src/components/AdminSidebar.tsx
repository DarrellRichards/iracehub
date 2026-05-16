"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  BarChart3,
  Users,
  Trophy,
  Grid,
  Settings,
  Share2,
  LogOut,
} from "lucide-react";

interface AdminSidebarProps {
  leagueId: string;
  leagueName: string;
  leagueLogo?: string | null;
  pendingJoinRequests?: number;
  onLogout?: () => void;
}

export function AdminSidebar({
  leagueId,
  leagueName,
  leagueLogo,
  pendingJoinRequests = 0,
  onLogout,
}: AdminSidebarProps) {
  const params = useParams<{ leagueId: string }>();
  const routeLeagueId = leagueId;

  const routes = [
    {
      label: "Overview",
      href: `/app/${routeLeagueId}/admin`,
      icon: BarChart3,
      exact: true,
    },
    {
      label: "Series & Seasons",
      href: `/app/${routeLeagueId}/admin/series`,
      icon: Trophy,
    },
    {
      label: `Members`,
      href: `/app/${routeLeagueId}/admin/members`,
      icon: Users,
    },
    {
      label: "Points Systems",
      href: `/app/${routeLeagueId}/admin/points-system`,
      icon: Grid,
    },
    {
      label: "Widgets",
      href: `/app/${routeLeagueId}/admin/widgets`,
      icon: Share2,
    },
    {
      label: "Settings",
      href: `/app/${routeLeagueId}/admin/settings`,
      icon: Settings,
    },
  ];

  const isActive = (href: string, exact: boolean = false) => {
    if (exact) {
      return (
        params.leagueId === routeLeagueId && window.location.pathname === href
      );
    }
    return window.location.pathname.includes(href);
  };

  return (
    <aside className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 mb-4 hover:opacity-80 transition-opacity"
        >
          <div className="text-xl font-black tracking-tight">
            i<span className="text-red-500">Race</span>Hub
          </div>
        </Link>
        <div className="flex items-center gap-3">
          {leagueLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={leagueLogo}
              alt={leagueName}
              className="w-10 h-10 rounded-lg object-cover border border-zinc-700"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-lg">
              🏁
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-white truncate">
              {leagueName}
            </h2>
            <p className="text-xs text-zinc-400">Admin Panel</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {routes.map((route) => {
          const Icon = route.icon;
          const active = isActive(route.href, route.exact);
          return (
            <Link
              key={route.href}
              href={route.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors relative group ${
                active
                  ? "bg-red-500/10 text-red-400 border border-red-500/30"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm font-medium flex-1">{route.label}</span>
              {route.label === "Members" && pendingJoinRequests > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-semibold">
                  {pendingJoinRequests}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-zinc-800 space-y-2">
        <Link
          href={`/app/${routeLeagueId}`}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors"
        >
          ← Back to League
        </Link>
        {onLogout && (
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-red-400 hover:bg-zinc-800/50 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        )}
      </div>
    </aside>
  );
}
