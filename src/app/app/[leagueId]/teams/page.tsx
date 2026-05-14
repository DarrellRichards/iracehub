"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

interface TeamDirectoryResponse {
  league: {
    id: string;
    iracingLeagueId: number;
    leagueName: string;
  };
  viewer: {
    id: string;
    custId: number;
    displayName: string;
  };
  myTeam: {
    id: string;
    name: string;
    myRole: "CAPTAIN" | "DRIVER";
    isCaptain: boolean;
    members: Array<{
      id: string;
      role: "CAPTAIN" | "DRIVER";
      joinedAt: string;
      member: {
        id: string;
        custId: number;
        displayName: string;
        carNumber: string | null;
        nickName: string | null;
      };
    }>;
    pendingInvites: Array<{
      id: string;
      status: "PENDING";
      createdAt: string;
      invitedMember: {
        id: string;
        custId: number;
        displayName: string;
        carNumber: string | null;
        nickName: string | null;
      };
    }>;
  } | null;
  inviteCandidates: Array<{
    id: string;
    custId: number;
    displayName: string;
    carNumber: string | null;
    nickName: string | null;
    teamMembership: {
      team: {
        id: string;
        name: string;
      };
    } | null;
    hasPendingInviteFromMyTeam: boolean;
    canInvite: boolean;
  }>;
  teams: Array<{
    id: string;
    name: string;
    captainMemberId: string;
    members: Array<{
      id: string;
      role: "CAPTAIN" | "DRIVER";
      joinedAt: string;
      member: {
        id: string;
        custId: number;
        displayName: string;
        carNumber: string | null;
        nickName: string | null;
      };
    }>;
  }>;
  error?: string;
  message?: string;
}

async function readJsonSafely<T>(response: Response): Promise<T | null> {
  try {
    const raw = await response.text();
    if (!raw.trim()) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export default function TeamsPage() {
  const { session, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams<{ leagueId: string }>();

  const [data, setData] = useState<TeamDirectoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [teamSearch, setTeamSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [invitingCustId, setInvitingCustId] = useState<number | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !session?.authenticated) {
      router.replace("/");
    }
  }, [authLoading, router, session]);

  const loadTeams = useCallback(async () => {
    if (!session?.authenticated) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/leagues/${params.leagueId}/teams`, {
        cache: "no-store",
      });
      const payload = await readJsonSafely<TeamDirectoryResponse>(res);

      if (!res.ok || !payload) {
        throw new Error(
          payload?.error
            ? payload?.message
              ? `${payload.error}: ${payload.message}`
              : payload.error
            : `fetch_failed_${res.status}`,
        );
      }

      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed_to_load_teams");
    } finally {
      setLoading(false);
    }
  }, [params.leagueId, session?.authenticated]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadTeams();
    });
  }, [loadTeams]);

  async function handleCreateTeam() {
    const trimmed = teamName.trim();
    if (!trimmed) return;

    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch(`/api/leagues/${params.leagueId}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });

      const payload = await readJsonSafely<{
        error?: string;
        message?: string;
      }>(res);
      if (!res.ok) {
        throw new Error(
          payload?.error
            ? payload?.message
              ? `${payload.error}: ${payload.message}`
              : payload.error
            : `team_create_failed_${res.status}`,
        );
      }

      setTeamName("");
      await loadTeams();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "team_create_failed");
    } finally {
      setCreating(false);
    }
  }

  async function handleInviteMember(invitedCustId: number) {
    setInvitingCustId(invitedCustId);
    setInviteError(null);

    try {
      const res = await fetch(
        `/api/leagues/${params.leagueId}/teams/invitations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invitedCustId }),
        },
      );

      const payload = await readJsonSafely<{
        error?: string;
        message?: string;
      }>(res);

      if (!res.ok) {
        throw new Error(
          payload?.error
            ? payload?.message
              ? `${payload.error}: ${payload.message}`
              : payload.error
            : `team_invite_failed_${res.status}`,
        );
      }

      await loadTeams();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "team_invite_failed");
    } finally {
      setInvitingCustId(null);
    }
  }

  const filteredTeams = useMemo(() => {
    if (!data) return [];

    const search = teamSearch.trim().toLowerCase();
    if (!search) return data.teams;

    return data.teams.filter((team) => {
      const teamMatch = team.name.toLowerCase().includes(search);
      if (teamMatch) return true;

      return team.members.some((entry) => {
        const haystack = [
          entry.member.displayName,
          entry.member.nickName ?? "",
          entry.member.carNumber ?? "",
          String(entry.member.custId),
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(search);
      });
    });
  }, [data, teamSearch]);

  const filteredInviteCandidates = useMemo(() => {
    if (!data?.myTeam?.isCaptain) return [];

    const search = memberSearch.trim().toLowerCase();
    if (!search) return data.inviteCandidates;

    return data.inviteCandidates.filter((candidate) => {
      const haystack = [
        candidate.displayName,
        candidate.nickName ?? "",
        candidate.carNumber ?? "",
        String(candidate.custId),
        candidate.teamMembership?.team.name ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  }, [data, memberSearch]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session?.authenticated) return null;

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
            <Link
              href={`/app/${params.leagueId}`}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              ← League
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {error ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        ) : data ? (
          <div className="space-y-8">
            <section className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6">
              <h1 className="text-3xl font-black tracking-tight">Teams</h1>
              <p className="mt-2 text-zinc-400">
                {data.league.leagueName} · {filteredTeams.length} of{" "}
                {data.teams.length} team
                {data.teams.length === 1 ? "" : "s"}
              </p>
              <div className="mt-4">
                <input
                  value={teamSearch}
                  onChange={(event) => setTeamSearch(event.target.value)}
                  placeholder="Search teams, drivers, nicknames, car numbers, or cust IDs"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-zinc-600"
                />
              </div>
            </section>

            <section className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Team Creation
              </p>
              <h2 className="mt-1 text-xl font-bold text-white">
                {data.myTeam
                  ? `You are on ${data.myTeam.name}`
                  : "Create a Team"}
              </h2>
              <p className="mt-2 text-sm text-zinc-400">
                {data.myTeam
                  ? `Role: ${data.myTeam.isCaptain ? "Captain" : "Driver"}.`
                  : "Create your team here, then invite league members to join."}
              </p>

              {createError && (
                <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/20 px-3 py-2 text-xs text-red-400">
                  {createError}
                </div>
              )}

              {!data.myTeam && (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    value={teamName}
                    onChange={(event) => setTeamName(event.target.value)}
                    placeholder="Team name"
                    className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-zinc-600"
                  />
                  <button
                    onClick={handleCreateTeam}
                    disabled={creating || !teamName.trim()}
                    className="rounded-xl border border-red-800/50 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition-colors hover:border-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creating ? "Creating..." : "Create Team"}
                  </button>
                </div>
              )}
            </section>

            {data.myTeam?.isCaptain && (
              <section className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Invite Drivers
                </p>
                <h2 className="mt-1 text-xl font-bold text-white">
                  Search League Members
                </h2>
                <p className="mt-2 text-sm text-zinc-400">
                  Find league members and invite eligible drivers directly to{" "}
                  {data.myTeam.name}.
                </p>

                <div className="mt-4">
                  <input
                    value={memberSearch}
                    onChange={(event) => setMemberSearch(event.target.value)}
                    placeholder="Search by driver, nickname, car number, cust ID, or team"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-zinc-600"
                  />
                </div>

                {inviteError && (
                  <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/20 px-3 py-2 text-xs text-red-400">
                    {inviteError}
                  </div>
                )}

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-zinc-900 text-zinc-400">
                      <tr>
                        <th className="px-4 py-3 font-medium">Driver</th>
                        <th className="px-4 py-3 font-medium">Car #</th>
                        <th className="px-4 py-3 font-medium">Nickname</th>
                        <th className="px-4 py-3 font-medium">Team</th>
                        <th className="px-4 py-3 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800 bg-zinc-950/40">
                      {filteredInviteCandidates.length === 0 ? (
                        <tr>
                          <td className="px-4 py-4 text-zinc-500" colSpan={5}>
                            No league members match your search.
                          </td>
                        </tr>
                      ) : (
                        filteredInviteCandidates.map((candidate) => (
                          <tr
                            key={candidate.id}
                            className="hover:bg-zinc-900/60"
                          >
                            <td className="px-4 py-3 text-zinc-100">
                              <Link
                                href={`/app/drivers/${candidate.custId}?league=${data.league.iracingLeagueId}`}
                                className="text-zinc-100 hover:text-white transition-colors"
                              >
                                {candidate.displayName}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-zinc-300">
                              {candidate.carNumber ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-zinc-500">
                              {candidate.nickName ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-zinc-400">
                              {candidate.teamMembership?.team.name ??
                                "Unassigned"}
                            </td>
                            <td className="px-4 py-3">
                              {candidate.canInvite ? (
                                <button
                                  onClick={() =>
                                    void handleInviteMember(candidate.custId)
                                  }
                                  disabled={invitingCustId === candidate.custId}
                                  className="rounded-lg border border-red-800/50 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 transition-colors hover:border-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {invitingCustId === candidate.custId
                                    ? "Inviting..."
                                    : "Invite"}
                                </button>
                              ) : candidate.hasPendingInviteFromMyTeam ? (
                                <span className="text-xs text-amber-400">
                                  Invite pending
                                </span>
                              ) : candidate.teamMembership ? (
                                <span className="text-xs text-zinc-500">
                                  On team
                                </span>
                              ) : candidate.custId === data.viewer.custId ? (
                                <span className="text-xs text-zinc-500">
                                  You
                                </span>
                              ) : (
                                <span className="text-xs text-zinc-500">
                                  Unavailable
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="space-y-4">
              {filteredTeams.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 p-8 text-center">
                  <p className="text-zinc-400">
                    {data.teams.length > 0
                      ? "No teams match your search."
                      : "No teams created yet."}
                  </p>
                </div>
              ) : (
                filteredTeams.map((team) => (
                  <div
                    key={team.id}
                    className="rounded-3xl border border-zinc-800 bg-zinc-900/60 overflow-hidden"
                  >
                    <div className="border-b border-zinc-800 px-5 py-4 bg-zinc-900/80">
                      <h3 className="text-xl font-bold text-white">
                        {team.name}
                      </h3>
                      <p className="mt-1 text-sm text-zinc-500">
                        {team.members.length} driver
                        {team.members.length === 1 ? "" : "s"}
                      </p>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-zinc-900 text-zinc-400">
                          <tr>
                            <th className="px-4 py-3 font-medium">Role</th>
                            <th className="px-4 py-3 font-medium">Driver</th>
                            <th className="px-4 py-3 font-medium">Car #</th>
                            <th className="px-4 py-3 font-medium">Nickname</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800 bg-zinc-950/40">
                          {team.members.map((entry) => (
                            <tr key={entry.id} className="hover:bg-zinc-900/60">
                              <td className="px-4 py-3 text-zinc-300">
                                {entry.role === "CAPTAIN"
                                  ? "Captain"
                                  : "Driver"}
                              </td>
                              <td className="px-4 py-3">
                                <Link
                                  href={`/app/drivers/${entry.member.custId}?league=${data.league.iracingLeagueId}`}
                                  className="text-zinc-100 hover:text-white transition-colors"
                                >
                                  {entry.member.displayName}
                                </Link>
                              </td>
                              <td className="px-4 py-3 text-zinc-300">
                                {entry.member.carNumber ?? "—"}
                              </td>
                              <td className="px-4 py-3 text-zinc-500">
                                {entry.member.nickName ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}
