"use client";

import Link from "next/link";
import Image from "next/image";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";
import { DriverSearchBar } from "@/components/DriverSearchBar";
import { useEffect, useRef, useState } from "react";

interface EligibleLeague {
  leagueId: number;
  leagueName: string;
  owner: boolean;
  admin: boolean;
  alreadyCreated: boolean;
}

interface UserLeague {
  id: string;
  iracingLeagueId: number | null;
  routeLeagueId: string;
  leagueName: string;
  smallLogo: string | null;
  rosterCount: number | null;
  owner: boolean;
  admin: boolean;
  pendingJoinRequests: number;
  lastSyncedAt: string;
}

interface TeamInvitation {
  id: string;
  status: "PENDING";
  createdAt: string;
  team: {
    id: string;
    name: string;
    league: {
      id: string;
      iracingLeagueId: number;
      leagueName: string;
    };
    captain: {
      id: string;
      custId: number;
      displayName: string;
      carNumber: string | null;
      nickName: string | null;
    };
  };
  invitedByMember: {
    id: string;
    custId: number;
    displayName: string;
  };
}

function SessionTimer({ expiresAt }: { expiresAt: number | null }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (!expiresAt || now == null) return null;

  const remaining = Math.max(0, Math.round((expiresAt - now) / 1000));
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <span className="text-xs text-zinc-400">
      Token expires in{" "}
      <span className="font-mono text-zinc-200">
        {mins}:{String(secs).padStart(2, "0")}
      </span>
    </span>
  );
}

interface CreateLeagueModalProps {
  onClose: () => void;
}

function CreateLeagueModal({ onClose }: CreateLeagueModalProps) {
  const [leagues, setLeagues] = useState<EligibleLeague[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [creatingLeagueId, setCreatingLeagueId] = useState<number | null>(null);
  const [customLeagueName, setCustomLeagueName] = useState("");
  const [creatingCustomLeague, setCreatingCustomLeague] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setFetchError(null);
      try {
        const res = await fetch("/api/leagues/memberships", {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          items?: EligibleLeague[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "failed_to_load_leagues");
        if (!cancelled) setLeagues(Array.isArray(data.items) ? data.items : []);
      } catch (err) {
        if (!cancelled)
          setFetchError(err instanceof Error ? err.message : "unknown_error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleCreate(leagueId: number) {
    setActionError(null);
    setCreatingLeagueId(leagueId);
    try {
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "league_create_failed");
      setLeagues((prev) =>
        prev.map((l) =>
          l.leagueId === leagueId ? { ...l, alreadyCreated: true } : l,
        ),
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "unknown_error");
    } finally {
      setCreatingLeagueId(null);
    }
  }

  async function handleCreateCustomLeague() {
    const leagueName = customLeagueName.trim();
    if (!leagueName) {
      setActionError("Please enter a league name.");
      return;
    }

    setActionError(null);
    setCreatingCustomLeague(true);
    try {
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueName }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "league_create_failed");
      setCustomLeagueName("");
      onClose();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "unknown_error");
    } finally {
      setCreatingCustomLeague(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-bold">Create a League</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto">
          <div className="mb-5 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
              Create Without iRacing
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Use this if your league does not exist on iRacing yet. You can
              link an iRacing league ID later from the admin page.
            </p>
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={customLeagueName}
                onChange={(e) => setCustomLeagueName(e.target.value)}
                placeholder="League name"
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
              />
              <button
                onClick={() => void handleCreateCustomLeague()}
                disabled={creatingCustomLeague}
                className="shrink-0 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed hover:border-zinc-500 transition-colors"
              >
                {creatingCustomLeague ? "Creating…" : "Create"}
              </button>
            </div>
          </div>

          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Create From iRacing Memberships
          </p>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-7 w-7 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
            </div>
          ) : fetchError ? (
            <p className="text-red-400 text-sm">
              Failed to load leagues: {fetchError}
            </p>
          ) : leagues.length === 0 ? (
            <p className="text-zinc-400 text-sm">
              No eligible leagues found. You must be an owner or admin of a
              league in iRacing.
            </p>
          ) : (
            <ul className="space-y-3">
              {leagues.map((league) => {
                const isCreating = creatingLeagueId === league.leagueId;
                return (
                  <li
                    key={league.leagueId}
                    className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3"
                  >
                    <div>
                      <p className="font-semibold text-sm">
                        {league.leagueName}
                      </p>
                      <p className="text-xs text-zinc-500">
                        ID: {league.leagueId} ·{" "}
                        {league.owner ? "Owner" : "Admin"}
                      </p>
                    </div>
                    <button
                      onClick={() => handleCreate(league.leagueId)}
                      disabled={league.alreadyCreated || isCreating}
                      className="shrink-0 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed hover:border-zinc-500 transition-colors"
                    >
                      {league.alreadyCreated
                        ? "Created"
                        : isCreating
                          ? "Creating…"
                          : "Create"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {actionError ? (
            <p className="text-red-400 text-xs mt-4">Error: {actionError}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { session, loading, logout } = useAuth();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [userLeagues, setUserLeagues] = useState<UserLeague[]>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [teamInvitations, setTeamInvitations] = useState<TeamInvitation[]>([]);
  const [inviteActionLoading, setInviteActionLoading] = useState<string | null>(
    null,
  );
  const [userCustId, setUserCustId] = useState<number | null>(null);

  const sortedUserLeagues = [...userLeagues].sort((left, right) => {
    if (right.pendingJoinRequests !== left.pendingJoinRequests) {
      return right.pendingJoinRequests - left.pendingJoinRequests;
    }

    return left.leagueName.localeCompare(right.leagueName);
  });

  async function fetchTeamInvitations() {
    try {
      const res = await fetch("/api/teams/invitations", { cache: "no-store" });
      const data = (await res.json()) as { invitations?: TeamInvitation[] };
      setTeamInvitations(
        Array.isArray(data.invitations) ? data.invitations : [],
      );
    } catch {
      // silently ignore
    }
  }

  async function handleInvitationResponse(
    invitation: TeamInvitation,
    action: "accept" | "decline",
  ) {
    setInviteActionLoading(`${action}-${invitation.id}`);
    try {
      const leagueId = invitation.team.league.iracingLeagueId;
      const res = await fetch(
        `/api/leagues/${leagueId}/teams/invitations/${invitation.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      if (res.ok) {
        await fetchTeamInvitations();
      }
    } catch {
      // silently ignore
    } finally {
      setInviteActionLoading(null);
    }
  }

  async function fetchUserLeagues() {
    setLoadingLeagues(true);
    try {
      const res = await fetch("/api/leagues", { cache: "no-store" });
      const data = (await res.json()) as { leagues?: UserLeague[] };
      setUserLeagues(Array.isArray(data.leagues) ? data.leagues : []);
    } catch {
      // silently ignore
    } finally {
      setLoadingLeagues(false);
    }
  }

  useEffect(() => {
    if (!loading && !session?.authenticated) {
      router.replace("/");
    }
  }, [loading, session, router]);

  useEffect(() => {
    if (session?.authenticated) {
      void (async () => {
        await Promise.all([fetchUserLeagues(), fetchTeamInvitations()]);

        try {
          const res = await fetch("/api/auth/me", { cache: "no-store" });
          const data = (await res.json()) as { custId?: number };
          if (data.custId) {
            setUserCustId(data.custId);
          }
        } catch {
          // silently ignore
        }
      })();
    }
  }, [session?.authenticated]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session?.authenticated) return null;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {modalOpen && (
        <CreateLeagueModal
          onClose={() => {
            setModalOpen(false);
            fetchUserLeagues();
          }}
        />
      )}

      <header className="border-b border-zinc-800">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <span className="text-xl font-black tracking-tight">
            i<span className="text-red-500">Race</span>Hub
          </span>
          <div className="flex items-center gap-4">
            <DriverSearchBar />
            <SessionTimer expiresAt={session.expiresAt} />
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
        <div className="mb-10 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight mb-2">
              Dashboard
            </h1>
            <p className="text-zinc-400">
              Welcome back! Your iRacing session is active.
            </p>
            {session.isAdmin ? (
              <p className="text-xs text-green-400 mt-1">
                Admin routes enabled
              </p>
            ) : null}
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <Link
              href="/app/drivers"
              className="rounded-xl border border-zinc-700 hover:border-zinc-500 transition-colors px-4 py-2.5 text-sm font-semibold text-zinc-200"
            >
              Find Drivers
            </Link>
            {userCustId && (
              <Link
                href={`/app/drivers/${userCustId}`}
                className="rounded-xl border border-zinc-700 hover:border-zinc-500 transition-colors px-4 py-2.5 text-sm font-semibold text-zinc-200"
              >
                View My Profile
              </Link>
            )}
            <button
              onClick={() => setModalOpen(true)}
              disabled={loadingLeagues}
              className="rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 transition-all px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-600/20"
            >
              + Create a League
            </button>
          </div>
        </div>

        {/* Team Invitations */}
        {teamInvitations.length > 0 && (
          <div className="mb-10">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              Team Invitations
              <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-red-600 text-white text-[11px] font-bold">
                {teamInvitations.length}
              </span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {teamInvitations.map((invite) => (
                <div
                  key={invite.id}
                  className="rounded-2xl border border-amber-800/40 bg-amber-950/10 p-5 flex flex-col gap-4"
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-500/80 mb-1">
                      Team Invite
                    </p>
                    <p className="font-bold text-white text-base leading-tight">
                      {invite.team.name}
                    </p>
                    <p className="text-xs text-zinc-400 mt-1">
                      {invite.team.league.leagueName}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Invited by {invite.invitedByMember.displayName}
                    </p>
                    <p className="text-[11px] text-zinc-600 mt-1">
                      {new Date(invite.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="flex gap-2 mt-auto">
                    <button
                      onClick={() =>
                        void handleInvitationResponse(invite, "accept")
                      }
                      disabled={inviteActionLoading !== null}
                      className="flex-1 rounded-lg border border-green-700/60 px-3 py-1.5 text-xs font-semibold text-green-300 transition-colors hover:border-green-500 hover:bg-green-950/30 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {inviteActionLoading === `accept-${invite.id}`
                        ? "Accepting…"
                        : "Accept"}
                    </button>
                    <button
                      onClick={() =>
                        void handleInvitationResponse(invite, "decline")
                      }
                      disabled={inviteActionLoading !== null}
                      className="flex-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:border-zinc-500 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {inviteActionLoading === `decline-${invite.id}`
                        ? "Declining…"
                        : "Decline"}
                    </button>
                  </div>
                  <Link
                    href={`/app/${invite.team.league.iracingLeagueId}/teams`}
                    className="-mt-2 text-center text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    View Teams Page →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* My Leagues */}
        {loadingLeagues ? (
          <div className="flex items-center gap-2 text-zinc-500 text-sm py-8">
            <div className="h-4 w-4 rounded-full border-2 border-zinc-600 border-t-transparent animate-spin" />
            Loading leagues…
          </div>
        ) : userLeagues.length > 0 ? (
          <div>
            <h2 className="text-lg font-bold mb-4">My Leagues</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedUserLeagues.map((league) => (
                <div
                  key={league.id}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 flex flex-col gap-4"
                >
                  <div className="flex items-start gap-3">
                    {league.smallLogo ? (
                      <Image
                        src={league.smallLogo}
                        alt={league.leagueName}
                        width={48}
                        height={48}
                        unoptimized
                        className="h-12 w-12 rounded-xl object-cover border border-zinc-800 shrink-0"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-xl bg-zinc-800 flex items-center justify-center text-xl shrink-0">
                        🏁
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-bold text-sm leading-tight truncate">
                        {league.leagueName}
                      </p>
                      {(league.owner || league.admin) &&
                      league.pendingJoinRequests > 0 ? (
                        <p className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                          {league.pendingJoinRequests} pending join request
                          {league.pendingJoinRequests === 1 ? "" : "s"}
                        </p>
                      ) : null}
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {league.rosterCount != null
                          ? `${league.rosterCount} members · `
                          : ""}
                        {league.owner ? "Owner" : "Admin"}
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Last synced from iRacing:{" "}
                        {new Date(league.lastSyncedAt).toLocaleString()}
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-1">
                        {league.iracingLeagueId != null
                          ? `iRacing League ID: ${league.iracingLeagueId}`
                          : "iRacing: Not linked yet"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-auto flex-col">
                    <div className="flex gap-2">
                      <Link
                        href={`/app/${league.routeLeagueId}`}
                        className="flex-1 text-center rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors px-3 py-1.5 text-xs font-semibold text-zinc-200"
                      >
                        View League
                      </Link>
                      {(league.owner || league.admin) && (
                        <Link
                          href={`/app/${league.routeLeagueId}/admin`}
                          className="flex-1 text-center rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors px-3 py-1.5 text-xs font-semibold text-zinc-200"
                        >
                          Admin
                        </Link>
                      )}
                    </div>
                    {(league.owner || league.admin) && (
                      <Link
                        href={`/app/${league.routeLeagueId}/admin/join-requests`}
                        className="w-full text-center rounded-lg border border-amber-700/50 hover:border-amber-600 bg-amber-500/10 hover:bg-amber-500/20 transition-colors px-3 py-1.5 text-xs font-semibold text-amber-300"
                      >
                        Join Requests
                        {league.pendingJoinRequests > 0
                          ? ` (${league.pendingJoinRequests})`
                          : ""}
                      </Link>
                    )}
                    {userCustId && (
                      <Link
                        href={`/app/drivers/${userCustId}?league=${league.id}`}
                        className="w-full text-center rounded-lg border border-green-700/50 hover:border-green-600 bg-green-500/10 hover:bg-green-500/20 transition-colors px-3 py-1.5 text-xs font-semibold text-green-400"
                      >
                        💰 My Earnings
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/50 p-16 text-center">
            <div className="text-5xl mb-4">🏁</div>
            <h2 className="text-xl font-bold mb-2">No leagues yet</h2>
            <p className="text-zinc-500 max-w-md mx-auto text-sm">
              Create a league to get started. You must be an owner or admin in
              iRacing.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
