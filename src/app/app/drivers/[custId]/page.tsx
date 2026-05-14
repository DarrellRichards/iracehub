"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { formatMoney } from "@/lib/money";

interface DriverSummary {
  starts: number;
  wins: number;
  top5: number;
  avgFinish: number | null;
  totalPoints: number;
}

interface DriverLeagueSummary {
  leagueId: string;
  iracingLeagueId: number;
  leagueName: string;
  starts: number;
  wins: number;
  top5: number;
  totalPoints: number;
}

interface DriverResultRow {
  id: string;
  displayName: string;
  finishPosition: number | null;
  startPosition: number | null;
  lapsCompleted: number | null;
  incidents: number | null;
  pointsBase: number;
  pointsAdjustment: number;
  finalPoints: number;
  virtualEarnings: number | null;
  provisional: boolean;
  notes: string | null;
  raceSession: {
    id: string;
    launchAt: string;
    trackName: string | null;
    league: {
      id: string;
      iracingLeagueId: number;
      leagueName: string;
    };
    series: {
      id: string;
      name: string;
    };
    season: {
      id: string;
      seasonName: string;
    };
    schedule: {
      raceName: string;
      eventDate: string;
      raceOrder: number;
    } | null;
  };
}

interface DriverResponse {
  driver: {
    custId: number;
    displayName: string;
  };
  summary: DriverSummary;
  leagues: DriverLeagueSummary[];
  results: DriverResultRow[];
}

interface TeamContextResponse {
  league: {
    id: string;
    iracingLeagueId: number;
    leagueName: string;
  };
  viewer: {
    id: string;
    custId: number;
    displayName: string;
    carNumber: string | null;
    nickName: string | null;
  };
  myTeam: {
    id: string;
    name: string;
    captainMemberId: string;
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
  pendingInvites: Array<{
    id: string;
    status: "PENDING";
    createdAt: string;
    team: {
      id: string;
      name: string;
      captain: {
        id: string;
        custId: number;
        displayName: string;
        carNumber: string | null;
        nickName: string | null;
      };
    };
  }>;
  targetMember: {
    id: string;
    custId: number;
    displayName: string;
    carNumber: string | null;
    nickName: string | null;
    teamMembership: {
      role: "CAPTAIN" | "DRIVER";
      team: {
        id: string;
        name: string;
      };
    } | null;
  } | null;
}

interface LeagueMemberProfileResponse {
  league: {
    id: string;
    virtualModeEnabled: boolean;
  };
  targetProfile: {
    id: string;
    custId: number;
    displayName: string;
    carNumber: string | null;
    nickName: string | null;
    profileHeadline: string | null;
    profileBio: string | null;
  };
  virtualMoney: {
    raceCount: number;
    totalPayout: number;
    totalEntryCost: number;
    netEarned: number;
  };
  canEdit: boolean;
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

export default function DriverProfilePage() {
  const { session, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams<{ custId: string }>();
  const searchParams = useSearchParams();

  const [data, setData] = useState<DriverResponse | null>(null);
  const [teamData, setTeamData] = useState<TeamContextResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamActionLoading, setTeamActionLoading] = useState<string | null>(
    null,
  );
  const [leagueProfile, setLeagueProfile] =
    useState<LeagueMemberProfileResponse | null>(null);
  const [profileHeadlineInput, setProfileHeadlineInput] = useState("");
  const [profileBioInput, setProfileBioInput] = useState("");
  const [profileSaveStatus, setProfileSaveStatus] = useState<string | null>(
    null,
  );
  const [profileSaving, setProfileSaving] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const fromLeagueId = searchParams.get("league") ?? null;

  useEffect(() => {
    if (!authLoading && !session?.authenticated) {
      router.replace("/");
    }
  }, [authLoading, session, router]);

  useEffect(() => {
    if (!session?.authenticated) return;

    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      setTeamError(null);
      setProfileSaveStatus(null);
      try {
        const [driverRes, teamRes, profileRes] = await Promise.all([
          fetch(`/api/drivers/${params.custId}`, {
            cache: "no-store",
          }),
          fromLeagueId
            ? fetch(
                `/api/leagues/${fromLeagueId}/teams?targetCustId=${params.custId}`,
                { cache: "no-store" },
              )
            : Promise.resolve(null),
          fromLeagueId
            ? fetch(
                `/api/leagues/${fromLeagueId}/members/profile?custId=${params.custId}`,
                { cache: "no-store" },
              )
            : Promise.resolve(null),
        ]);

        const driverPayload = await readJsonSafely<
          DriverResponse & { error?: string }
        >(driverRes);

        if (!driverRes.ok || !driverPayload) {
          throw new Error(
            driverPayload?.error ?? `fetch_failed_${driverRes.status}`,
          );
        }

        const teamPayload = teamRes
          ? await readJsonSafely<TeamContextResponse & { error?: string }>(
              teamRes,
            )
          : null;

        const profilePayload = profileRes
          ? await readJsonSafely<
              LeagueMemberProfileResponse & { error?: string }
            >(profileRes)
          : null;

        if (teamRes && (!teamRes.ok || !teamPayload)) {
          throw new Error(
            teamPayload?.error ?? `team_fetch_failed_${teamRes.status}`,
          );
        }

        if (profileRes && (!profileRes.ok || !profilePayload)) {
          throw new Error(
            profilePayload?.error ??
              `profile_fetch_failed_${profileRes.status}`,
          );
        }

        if (!cancelled) {
          setData(driverPayload);
          setTeamData(teamPayload);
          setLeagueProfile(profilePayload);
          setProfileHeadlineInput(
            profilePayload?.targetProfile.profileHeadline ?? "",
          );
          setProfileBioInput(profilePayload?.targetProfile.profileBio ?? "");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "unknown_error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [fromLeagueId, params.custId, reloadToken, session?.authenticated]);

  const isViewingOwnLeagueProfile = useMemo(() => {
    return Boolean(
      teamData && data && teamData.viewer.custId === data.driver.custId,
    );
  }, [data, teamData]);

  const viewedDriverTeam = teamData?.targetMember?.teamMembership?.team ?? null;
  const alreadyInvitedViewedDriver = Boolean(
    teamData?.myTeam?.pendingInvites.some(
      (invite) => invite.invitedMember.custId === data?.driver.custId,
    ),
  );

  async function refreshTeamContext() {
    setReloadToken((token) => token + 1);
  }

  async function handleSaveLeagueProfile() {
    if (!fromLeagueId || !leagueProfile?.canEdit) return;

    setProfileSaving(true);
    setProfileSaveStatus(null);
    try {
      const res = await fetch(`/api/leagues/${fromLeagueId}/members/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileHeadline: profileHeadlineInput,
          profileBio: profileBioInput,
        }),
      });

      const payload = await readJsonSafely<{ error?: string }>(res);
      if (!res.ok) {
        throw new Error(payload?.error ?? `profile_save_failed_${res.status}`);
      }

      setProfileSaveStatus("Profile updated.");
      setReloadToken((token) => token + 1);
    } catch (err) {
      setProfileSaveStatus(
        err instanceof Error ? err.message : "profile_save_failed",
      );
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleCreateTeam() {
    if (!fromLeagueId || !newTeamName.trim()) return;

    setTeamActionLoading("create");
    setTeamError(null);

    try {
      const res = await fetch(`/api/leagues/${fromLeagueId}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTeamName.trim() }),
      });

      const payload = await readJsonSafely<{ error?: string }>(res);
      if (!res.ok) {
        throw new Error(payload?.error ?? `team_create_failed_${res.status}`);
      }

      setNewTeamName("");
      await refreshTeamContext();
    } catch (err) {
      setTeamError(err instanceof Error ? err.message : "team_create_failed");
    } finally {
      setTeamActionLoading(null);
    }
  }

  async function handleInviteDriver() {
    if (!fromLeagueId || !data) return;

    setTeamActionLoading("invite");
    setTeamError(null);

    try {
      const res = await fetch(
        `/api/leagues/${fromLeagueId}/teams/invitations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invitedCustId: data.driver.custId }),
        },
      );

      const payload = await readJsonSafely<{ error?: string }>(res);
      if (!res.ok) {
        throw new Error(payload?.error ?? `team_invite_failed_${res.status}`);
      }

      await refreshTeamContext();
    } catch (err) {
      setTeamError(err instanceof Error ? err.message : "team_invite_failed");
    } finally {
      setTeamActionLoading(null);
    }
  }

  async function handleInvitationResponse(
    invitationId: string,
    action: "accept" | "decline",
  ) {
    if (!fromLeagueId) return;

    setTeamActionLoading(`${action}-${invitationId}`);
    setTeamError(null);

    try {
      const res = await fetch(
        `/api/leagues/${fromLeagueId}/teams/invitations/${invitationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );

      const payload = await readJsonSafely<{ error?: string }>(res);
      if (!res.ok) {
        throw new Error(
          payload?.error ?? `team_invitation_failed_${res.status}`,
        );
      }

      await refreshTeamContext();
    } catch (err) {
      setTeamError(
        err instanceof Error ? err.message : "team_invitation_failed",
      );
    } finally {
      setTeamActionLoading(null);
    }
  }

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
            {fromLeagueId ? (
              <Link
                href={`/app/${fromLeagueId}/standings`}
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                ← Standings
              </Link>
            ) : (
              <Link
                href="/dashboard"
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                ← Dashboard
              </Link>
            )}
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
            <div>
              <h1 className="text-3xl font-black tracking-tight">
                {data.driver.displayName}
              </h1>
              <p className="text-zinc-500 text-sm mt-1">
                iRacing ID #{data.driver.custId}
              </p>
            </div>

            {fromLeagueId && leagueProfile && (
              <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
                <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                  <div>
                    <h2 className="text-lg font-semibold">League Profile</h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      Profile details are saved only for this league.
                    </p>

                    {leagueProfile.canEdit ? (
                      <div className="mt-4 space-y-3">
                        <label className="block text-xs text-zinc-400 space-y-1">
                          <span className="block uppercase tracking-widest">
                            Headline
                          </span>
                          <input
                            value={profileHeadlineInput}
                            onChange={(event) =>
                              setProfileHeadlineInput(event.target.value)
                            }
                            maxLength={80}
                            placeholder="Short driver headline"
                            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-zinc-600"
                          />
                        </label>

                        <label className="block text-xs text-zinc-400 space-y-1">
                          <span className="block uppercase tracking-widest">
                            Bio
                          </span>
                          <textarea
                            value={profileBioInput}
                            onChange={(event) =>
                              setProfileBioInput(event.target.value)
                            }
                            maxLength={1200}
                            rows={4}
                            placeholder="Tell your league a little about your driving style, goals, or team role."
                            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-zinc-600"
                          />
                        </label>

                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-zinc-500">
                            {profileHeadlineInput.length}/80 ·{" "}
                            {profileBioInput.length}/1200
                          </p>
                          <button
                            onClick={handleSaveLeagueProfile}
                            disabled={profileSaving}
                            className="rounded-xl border border-red-800/50 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition-colors hover:border-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {profileSaving ? "Saving..." : "Save Profile"}
                          </button>
                        </div>

                        {profileSaveStatus && (
                          <p className="text-sm text-zinc-300">
                            {profileSaveStatus}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                        <p className="text-sm font-medium text-zinc-200">
                          {leagueProfile.targetProfile.profileHeadline ??
                            "No headline yet"}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-400">
                          {leagueProfile.targetProfile.profileBio ??
                            "No bio set for this league."}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                    <p className="text-xs uppercase tracking-widest text-zinc-500">
                      Virtual Money
                    </p>
                    {leagueProfile.league.virtualModeEnabled ? (
                      <>
                        <p className="mt-2 text-3xl font-black text-white">
                          {formatMoney(leagueProfile.virtualMoney.netEarned)}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          Net earned in this league
                        </p>

                        <div className="mt-4 space-y-2 text-sm text-zinc-300">
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-500">Races</span>
                            <span>{leagueProfile.virtualMoney.raceCount}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-500">Total Payout</span>
                            <span>
                              {formatMoney(
                                leagueProfile.virtualMoney.totalPayout,
                              )}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-500">Entry Cost</span>
                            <span>
                              {formatMoney(
                                leagueProfile.virtualMoney.totalEntryCost,
                              )}
                            </span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-zinc-500">
                        Virtual mode is currently disabled for this league.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                <p className="text-[11px] uppercase tracking-widest text-zinc-500">
                  Starts
                </p>
                <p className="text-xl font-semibold mt-1">
                  {data.summary.starts}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                <p className="text-[11px] uppercase tracking-widest text-zinc-500">
                  Wins
                </p>
                <p className="text-xl font-semibold mt-1">
                  {data.summary.wins}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                <p className="text-[11px] uppercase tracking-widest text-zinc-500">
                  Top 5
                </p>
                <p className="text-xl font-semibold mt-1">
                  {data.summary.top5}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                <p className="text-[11px] uppercase tracking-widest text-zinc-500">
                  Avg Finish
                </p>
                <p className="text-xl font-semibold mt-1">
                  {data.summary.avgFinish == null
                    ? "—"
                    : data.summary.avgFinish}
                </p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
                <p className="text-[11px] uppercase tracking-widest text-zinc-500">
                  Total Points
                </p>
                <p className="text-xl font-semibold mt-1">
                  {data.summary.totalPoints}
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold mb-3">By League</h2>
              {data.leagues.length === 0 ? (
                <p className="text-sm text-zinc-500">No race history found.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {data.leagues.map((league) => (
                    <div
                      key={league.leagueId}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <Link
                            href={`/app/${league.iracingLeagueId}`}
                            className="font-semibold text-white hover:text-red-400 transition-colors"
                          >
                            {league.leagueName}
                          </Link>
                          <p className="text-xs text-zinc-500">
                            League #{league.iracingLeagueId}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-zinc-100">
                          {league.totalPoints} pts
                        </p>
                      </div>
                      <div className="mt-3 text-xs text-zinc-400 grid grid-cols-3 gap-2">
                        <span>Starts: {league.starts}</span>
                        <span>Wins: {league.wins}</span>
                        <span>Top5: {league.top5}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {fromLeagueId && teamData && (
              <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">Teams</h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      Create a team for this league, invite drivers, and manage
                      pending invites.
                    </p>
                  </div>
                  <Link
                    href={`/app/${fromLeagueId}`}
                    className="text-sm text-zinc-400 transition-colors hover:text-white"
                  >
                    ← Back to League
                  </Link>
                </div>

                {teamError && (
                  <div className="mt-4 rounded-xl border border-red-900/60 bg-red-950/20 px-4 py-3 text-sm text-red-400">
                    {teamError}
                  </div>
                )}

                <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-4">
                    {teamData.myTeam ? (
                      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-widest text-zinc-500">
                              Your Team
                            </p>
                            <h3 className="mt-1 text-xl font-bold text-white">
                              {teamData.myTeam.name}
                            </h3>
                            <p className="mt-1 text-sm text-zinc-400">
                              Role:{" "}
                              {teamData.myTeam.isCaptain ? "Captain" : "Driver"}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 rounded-xl border border-zinc-800 overflow-hidden">
                          <div className="bg-zinc-900 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                            Team Members ({teamData.myTeam.members.length})
                          </div>
                          <div className="divide-y divide-zinc-800">
                            {teamData.myTeam.members.map((entry) => (
                              <div
                                key={entry.id}
                                className="flex items-center justify-between gap-3 px-4 py-3"
                              >
                                <div>
                                  <Link
                                    href={`/app/drivers/${entry.member.custId}?league=${fromLeagueId}`}
                                    className="text-sm font-medium text-zinc-100 transition-colors hover:text-white"
                                  >
                                    {entry.member.displayName}
                                  </Link>
                                  <p className="mt-1 text-xs text-zinc-500">
                                    {entry.role === "CAPTAIN"
                                      ? "Captain"
                                      : "Driver"}
                                    {entry.member.carNumber
                                      ? ` · #${entry.member.carNumber}`
                                      : ""}
                                    {entry.member.nickName
                                      ? ` · ${entry.member.nickName}`
                                      : ""}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {teamData.myTeam.pendingInvites.length > 0 && (
                          <div className="mt-4 rounded-xl border border-zinc-800 overflow-hidden">
                            <div className="bg-zinc-900 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                              Pending Invites (
                              {teamData.myTeam.pendingInvites.length})
                            </div>
                            <div className="divide-y divide-zinc-800">
                              {teamData.myTeam.pendingInvites.map((invite) => (
                                <div
                                  key={invite.id}
                                  className="flex items-center justify-between gap-3 px-4 py-3"
                                >
                                  <div>
                                    <Link
                                      href={`/app/drivers/${invite.invitedMember.custId}?league=${fromLeagueId}`}
                                      className="text-sm font-medium text-zinc-100 transition-colors hover:text-white"
                                    >
                                      {invite.invitedMember.displayName}
                                    </Link>
                                    <p className="mt-1 text-xs text-zinc-500">
                                      Invited{" "}
                                      {new Date(
                                        invite.createdAt,
                                      ).toLocaleDateString()}
                                    </p>
                                  </div>
                                  <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                                    Pending
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : isViewingOwnLeagueProfile ? (
                      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                        <p className="text-xs uppercase tracking-widest text-zinc-500">
                          Create Team
                        </p>
                        <h3 className="mt-1 text-xl font-bold text-white">
                          Start your own team
                        </h3>
                        <p className="mt-2 text-sm text-zinc-400">
                          Pick a team name, become the captain, and start
                          inviting drivers from this league.
                        </p>
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                          <input
                            value={newTeamName}
                            onChange={(event) =>
                              setNewTeamName(event.target.value)
                            }
                            placeholder="Enter team name"
                            className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-zinc-600"
                          />
                          <button
                            onClick={handleCreateTeam}
                            disabled={
                              teamActionLoading === "create" ||
                              !newTeamName.trim()
                            }
                            className="rounded-xl border border-red-800/50 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition-colors hover:border-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {teamActionLoading === "create"
                              ? "Creating..."
                              : "Create Team"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                        <p className="text-xs uppercase tracking-widest text-zinc-500">
                          Driver Team
                        </p>
                        <h3 className="mt-1 text-xl font-bold text-white">
                          {viewedDriverTeam
                            ? viewedDriverTeam.name
                            : "No team yet"}
                        </h3>
                        <p className="mt-2 text-sm text-zinc-400">
                          {viewedDriverTeam
                            ? `${data.driver.displayName} is already racing with ${viewedDriverTeam.name}.`
                            : `${data.driver.displayName} is not currently assigned to a team in this league.`}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    {isViewingOwnLeagueProfile &&
                      teamData.pendingInvites.length > 0 && (
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 overflow-hidden">
                          <div className="bg-zinc-900 px-4 py-3">
                            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                              Pending Team Invites
                            </p>
                          </div>
                          <div className="divide-y divide-zinc-800">
                            {teamData.pendingInvites.map((invite) => (
                              <div key={invite.id} className="px-4 py-4">
                                <p className="text-sm font-medium text-zinc-100">
                                  {invite.team.name}
                                </p>
                                <p className="mt-1 text-xs text-zinc-500">
                                  Invited by {invite.team.captain.displayName}
                                </p>
                                <div className="mt-3 flex gap-2">
                                  <button
                                    onClick={() =>
                                      handleInvitationResponse(
                                        invite.id,
                                        "accept",
                                      )
                                    }
                                    disabled={
                                      teamActionLoading ===
                                      `accept-${invite.id}`
                                    }
                                    className="rounded-lg border border-green-700/60 px-3 py-1.5 text-xs font-semibold text-green-300 transition-colors hover:border-green-500 disabled:opacity-60"
                                  >
                                    {teamActionLoading === `accept-${invite.id}`
                                      ? "Accepting..."
                                      : "Accept"}
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleInvitationResponse(
                                        invite.id,
                                        "decline",
                                      )
                                    }
                                    disabled={
                                      teamActionLoading ===
                                      `decline-${invite.id}`
                                    }
                                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition-colors hover:border-zinc-500 disabled:opacity-60"
                                  >
                                    {teamActionLoading ===
                                    `decline-${invite.id}`
                                      ? "Declining..."
                                      : "Decline"}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {teamData.myTeam?.isCaptain &&
                      !isViewingOwnLeagueProfile &&
                      !viewedDriverTeam &&
                      !alreadyInvitedViewedDriver && (
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                          <p className="text-xs uppercase tracking-widest text-zinc-500">
                            Invite Driver
                          </p>
                          <h3 className="mt-1 text-xl font-bold text-white">
                            Invite {data.driver.displayName}
                          </h3>
                          <p className="mt-2 text-sm text-zinc-400">
                            Send an invite from {teamData.myTeam.name} to join
                            your league team.
                          </p>
                          <button
                            onClick={handleInviteDriver}
                            disabled={teamActionLoading === "invite"}
                            className="mt-4 rounded-xl border border-red-800/50 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition-colors hover:border-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {teamActionLoading === "invite"
                              ? "Sending..."
                              : "Invite to Team"}
                          </button>
                        </div>
                      )}

                    {teamData.myTeam?.isCaptain &&
                      alreadyInvitedViewedDriver && (
                        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                          <p className="text-xs uppercase tracking-widest text-zinc-500">
                            Invite Status
                          </p>
                          <h3 className="mt-1 text-xl font-bold text-white">
                            Invitation already sent
                          </h3>
                          <p className="mt-2 text-sm text-zinc-400">
                            {data.driver.displayName} already has a pending
                            invitation from {teamData.myTeam.name}.
                          </p>
                        </div>
                      )}
                  </div>
                </div>
              </section>
            )}

            <section>
              <h2 className="text-lg font-semibold mb-3">All Results</h2>
              {data.results.length === 0 ? (
                <p className="text-sm text-zinc-500">No results found.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-zinc-800">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-900/80 text-zinc-500 text-xs uppercase tracking-widest">
                      <tr>
                        <th className="text-left px-3 py-2">Date</th>
                        <th className="text-left px-3 py-2">League</th>
                        <th className="text-left px-3 py-2">Series / Season</th>
                        <th className="text-left px-3 py-2">Event</th>
                        <th className="text-right px-3 py-2">Fin</th>
                        <th className="text-right px-3 py-2">Start</th>
                        <th className="text-right px-3 py-2">Pts</th>
                        <th className="text-right px-3 py-2">Earn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.results.map((result) => (
                        <tr
                          key={result.id}
                          className="border-t border-zinc-800 hover:bg-zinc-900/30"
                        >
                          <td className="px-3 py-2 text-zinc-400 text-xs">
                            {new Date(
                              result.raceSession.launchAt,
                            ).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2">
                            <Link
                              href={`/app/${result.raceSession.league.iracingLeagueId}`}
                              className="text-zinc-200 hover:text-red-400 transition-colors"
                            >
                              {result.raceSession.league.leagueName}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-zinc-400 text-xs">
                            {result.raceSession.series.name} ·{" "}
                            {result.raceSession.season.seasonName}
                          </td>
                          <td className="px-3 py-2 text-zinc-300">
                            {result.raceSession.schedule?.raceName ??
                              result.raceSession.trackName ??
                              "Race"}
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-300">
                            {result.finishPosition ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-right text-zinc-500">
                            {result.startPosition ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-zinc-100">
                            {result.finalPoints % 1 === 0
                              ? result.finalPoints
                              : result.finalPoints.toFixed(1)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-zinc-200">
                            {result.virtualEarnings == null
                              ? "—"
                              : formatMoney(result.virtualEarnings)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}
