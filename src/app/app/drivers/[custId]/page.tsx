"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { formatMoney } from "@/lib/money";
import { DriverSearchBar } from "@/components/DriverSearchBar";

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
    country: string | null;
    carNumber: string | null;
    nickName: string | null;
    profileHeadline: string | null;
    profileBio: string | null;
    lastSyncedAt: string;
  };
  virtualMoney: {
    raceCount: number;
    totalPayout: number;
    totalEntryCost: number;
    netEarned: number;
  };
  canEdit: boolean;
}

interface LeagueMemberSearchResult {
  id: string;
  custId: number;
  displayName: string;
  carNumber: string | null;
  nickName: string | null;
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

function formatCompactNumber(value: number | null | undefined) {
  if (value == null) return "—";
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

function buildTrendPath(points: number[], width: number, height: number) {
  if (points.length === 0) return "";
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;

  return points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((point - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function StatCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
      <div
        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`}
      />
      <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black tracking-tight text-white">
        {value}
      </p>
      <p className="mt-2 text-sm text-zinc-400">{detail}</p>
    </div>
  );
}

function TrendChart({
  title,
  subtitle,
  points,
  accent,
}: {
  title: string;
  subtitle: string;
  points: number[];
  accent: string;
}) {
  const path = buildTrendPath(points, 260, 90);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
        </div>
        <span
          className={`rounded-full px-2 py-1 text-[11px] font-semibold ${accent}`}
        >
          {points.length} races
        </span>
      </div>

      {points.length > 1 ? (
        <svg
          viewBox="0 0 260 100"
          className="mt-4 h-28 w-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient
              id={`gradient-${title.replace(/\s+/g, "-")}`}
              x1="0"
              x2="1"
              y1="0"
              y2="0"
            >
              <stop offset="0%" stopColor="#ef4444" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>
          <path
            d={path}
            fill="none"
            stroke={`url(#gradient-${title.replace(/\s+/g, "-")})`}
            strokeWidth="4"
            strokeLinecap="round"
          />
          {points.map((point, index) => {
            const max = Math.max(...points);
            const min = Math.min(...points);
            const range = max - min || 1;
            const x = (index / Math.max(points.length - 1, 1)) * 260;
            const y = 90 - ((point - min) / range) * 90;
            return (
              <circle
                key={`${title}-${index}`}
                cx={x}
                cy={y}
                r="3.5"
                fill="#fafafa"
                stroke="#ef4444"
                strokeWidth="2"
              />
            );
          })}
        </svg>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">
          Race another event to unlock the trend line.
        </div>
      )}
    </div>
  );
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
  const [profileResyncing, setProfileResyncing] = useState(false);
  const [viewerCustId, setViewerCustId] = useState<number | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [leagueMembers, setLeagueMembers] = useState<
    LeagueMemberSearchResult[]
  >([]);
  const [driverSearch, setDriverSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);

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

  useEffect(() => {
    if (!session?.authenticated) {
      setViewerCustId(null);
      return;
    }

    let cancelled = false;

    async function loadViewer() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const payload = await readJsonSafely<{ custId?: number }>(res);

        if (!cancelled && res.ok && payload?.custId) {
          setViewerCustId(payload.custId);
        }
      } catch {
        if (!cancelled) {
          setViewerCustId(null);
        }
      }
    }

    void loadViewer();

    return () => {
      cancelled = true;
    };
  }, [session?.authenticated]);

  useEffect(() => {
    if (!session?.authenticated || !fromLeagueId) {
      setLeagueMembers([]);
      return;
    }

    let cancelled = false;

    async function loadLeagueMembers() {
      setMemberSearchLoading(true);
      try {
        const res = await fetch(`/api/leagues/${fromLeagueId}/members`, {
          cache: "no-store",
        });
        const payload = await readJsonSafely<LeagueMemberSearchResult[]>(res);

        if (!res.ok || !payload) {
          throw new Error(`members_fetch_failed_${res.status}`);
        }

        if (!cancelled) {
          setLeagueMembers(payload);
        }
      } catch {
        if (!cancelled) {
          setLeagueMembers([]);
        }
      } finally {
        if (!cancelled) setMemberSearchLoading(false);
      }
    }

    loadLeagueMembers();

    return () => {
      cancelled = true;
    };
  }, [fromLeagueId, session?.authenticated]);

  const isViewingOwnLeagueProfile = useMemo(() => {
    return Boolean(
      teamData && data && teamData.viewer.custId === data.driver.custId,
    );
  }, [data, teamData]);

  const isViewingOwnDriverProfile = useMemo(() => {
    return Boolean(data && viewerCustId === data.driver.custId);
  }, [data, viewerCustId]);

  const viewedDriverTeam = teamData?.targetMember?.teamMembership?.team ?? null;
  const alreadyInvitedViewedDriver = Boolean(
    teamData?.myTeam?.pendingInvites.some(
      (invite) => invite.invitedMember.custId === data?.driver.custId,
    ),
  );

  const filteredResults = useMemo(() => {
    if (!data) return [];
    const query = historySearch.trim().toLowerCase();
    if (!query) return data.results;

    return data.results.filter((result) => {
      const haystack = [
        result.raceSession.league.leagueName,
        result.raceSession.series.name,
        result.raceSession.season.seasonName,
        result.raceSession.schedule?.raceName,
        result.raceSession.trackName,
        result.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [data, historySearch]);

  const filteredLeagues = useMemo(() => {
    if (!data) return [];
    const query = historySearch.trim().toLowerCase();
    if (!query) return data.leagues;

    return data.leagues.filter((league) =>
      league.leagueName.toLowerCase().includes(query),
    );
  }, [data, historySearch]);

  const searchableLeagueMembers = useMemo(() => {
    const query = driverSearch.trim().toLowerCase();
    return leagueMembers
      .filter((member) => member.custId !== data?.driver.custId)
      .filter((member) => {
        if (!query) return true;
        return [member.displayName, member.nickName, member.carNumber]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .slice(0, 8);
  }, [data?.driver.custId, driverSearch, leagueMembers]);

  const derivedStats = useMemo(() => {
    if (!data) {
      return {
        podiums: 0,
        avgStart: null as number | null,
        avgIncidents: null as number | null,
        provisionalCount: 0,
        totalEarnings: 0,
        bestGain: null as number | null,
        pointsTrend: [] as number[],
        finishTrend: [] as number[],
      };
    }

    let startTotal = 0;
    let startCount = 0;
    let incidentTotal = 0;
    let incidentCount = 0;
    let podiums = 0;
    let provisionalCount = 0;
    let totalEarnings = 0;
    let bestGain: number | null = null;

    for (const result of data.results) {
      if (result.finishPosition != null && result.finishPosition <= 3) {
        podiums += 1;
      }
      if (result.provisional) {
        provisionalCount += 1;
      }
      if (result.startPosition != null) {
        startTotal += result.startPosition;
        startCount += 1;
      }
      if (result.incidents != null) {
        incidentTotal += result.incidents;
        incidentCount += 1;
      }
      totalEarnings += result.virtualEarnings ?? 0;
      if (
        result.startPosition != null &&
        result.finishPosition != null &&
        result.startPosition > 0 &&
        result.finishPosition > 0
      ) {
        const gain = result.startPosition - result.finishPosition;
        bestGain = bestGain == null ? gain : Math.max(bestGain, gain);
      }
    }

    const recent = [...data.results].slice(0, 10).reverse();

    return {
      podiums,
      avgStart: startCount > 0 ? startTotal / startCount : null,
      avgIncidents: incidentCount > 0 ? incidentTotal / incidentCount : null,
      provisionalCount,
      totalEarnings,
      bestGain,
      pointsTrend: recent.map((result) => result.finalPoints ?? 0),
      finishTrend: recent.map(
        (result) => result.finishPosition ?? data.summary.starts + 1,
      ),
    };
  }, [data]);

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

  async function handleResyncLeagueProfile() {
    if (!fromLeagueId || !leagueProfile?.canEdit) return;

    setProfileResyncing(true);
    setProfileSaveStatus(null);
    try {
      const res = await fetch(`/api/leagues/${fromLeagueId}/members/profile`, {
        method: "POST",
      });

      const payload = await readJsonSafely<{ error?: string }>(res);
      if (!res.ok) {
        throw new Error(
          payload?.error ?? `profile_resync_failed_${res.status}`,
        );
      }

      setProfileSaveStatus("Profile synced from iRacing.");
      setReloadToken((token) => token + 1);
    } catch (err) {
      setProfileSaveStatus(
        err instanceof Error ? err.message : "profile_resync_failed",
      );
    } finally {
      setProfileResyncing(false);
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
            <DriverSearchBar />
            {isViewingOwnDriverProfile && data?.leagues.length ? (
              <Link
                href={`/app/drivers/${data.driver.custId}?league=${data.leagues[0].leagueId}#league-profile`}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition-colors hover:border-zinc-500"
              >
                Edit Profile
              </Link>
            ) : null}
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
            <section className="relative overflow-hidden rounded-[28px] border border-zinc-800 bg-zinc-900/70 p-6 shadow-2xl shadow-black/20">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(239,68,68,0.18),_transparent_35%),radial-gradient(circle_at_bottom_left,_rgba(245,158,11,0.14),_transparent_30%)]" />
              <div className="relative grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-red-300">
                      Driver Passport
                    </span>
                    <span className="rounded-full border border-zinc-700 bg-zinc-950/70 px-3 py-1 text-xs text-zinc-400">
                      iRacing ID #{data.driver.custId}
                    </span>
                    {fromLeagueId && (
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                        League context enabled
                      </span>
                    )}
                  </div>

                  <h1 className="mt-5 text-4xl font-black tracking-tight text-white sm:text-5xl">
                    {data.driver.displayName}
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-base">
                    A stat-first driver page with searchable history, instant
                    league navigation, and recent-performance visuals.
                  </p>

                  <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <StatCard
                      label="Starts"
                      value={String(data.summary.starts)}
                      detail={`${data.summary.wins} wins · ${derivedStats.podiums} podiums`}
                      accent="from-red-500 via-red-400 to-amber-300"
                    />
                    <StatCard
                      label="Average Finish"
                      value={formatCompactNumber(data.summary.avgFinish)}
                      detail={`Avg start ${formatCompactNumber(derivedStats.avgStart)}`}
                      accent="from-sky-500 via-cyan-400 to-emerald-300"
                    />
                    <StatCard
                      label="Total Points"
                      value={formatCompactNumber(data.summary.totalPoints)}
                      detail={`Top 5 finishes: ${data.summary.top5}`}
                      accent="from-violet-500 via-fuchsia-400 to-pink-300"
                    />
                    <StatCard
                      label="Racecraft"
                      value={formatCompactNumber(derivedStats.bestGain)}
                      detail={`Best spots gained · ${formatCompactNumber(derivedStats.avgIncidents)} avg inc`}
                      accent="from-amber-500 via-orange-400 to-red-300"
                    />
                  </div>
                </div>

                <div className="rounded-3xl border border-zinc-800 bg-zinc-950/70 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
                        Driver Finder
                      </p>
                      <p className="mt-1 text-sm text-zinc-400">
                        Jump to another driver page fast.
                      </p>
                    </div>
                    {memberSearchLoading && (
                      <div className="h-5 w-5 rounded-full border-2 border-zinc-600 border-t-transparent animate-spin" />
                    )}
                  </div>

                  {fromLeagueId ? (
                    <>
                      <input
                        value={driverSearch}
                        onChange={(event) =>
                          setDriverSearch(event.target.value)
                        }
                        placeholder="Search by name, nickname, or car #"
                        className="mt-4 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-red-500"
                      />

                      <div className="mt-4 space-y-2">
                        {searchableLeagueMembers.length > 0 ? (
                          searchableLeagueMembers.map((member) => (
                            <Link
                              key={member.id}
                              href={`/app/drivers/${member.custId}?league=${fromLeagueId}`}
                              className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/80 px-4 py-3 transition-colors hover:border-red-500/40 hover:bg-zinc-900"
                            >
                              <div>
                                <p className="text-sm font-semibold text-zinc-100">
                                  {member.displayName}
                                </p>
                                <p className="mt-1 text-xs text-zinc-500">
                                  {member.nickName
                                    ? `${member.nickName} · `
                                    : ""}
                                  {member.carNumber
                                    ? `#${member.carNumber}`
                                    : `ID ${member.custId}`}
                                </p>
                              </div>
                              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300">
                                Open
                              </span>
                            </Link>
                          ))
                        ) : (
                          <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500">
                            {driverSearch.trim()
                              ? "No matching league drivers found."
                              : "Search league drivers to open their pages."}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500">
                      Open this page from a league context to unlock quick
                      driver search.
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                        Provisionals
                      </p>
                      <p className="mt-2 text-2xl font-black text-white">
                        {derivedStats.provisionalCount}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-3">
                      <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                        Career Earnings
                      </p>
                      <p className="mt-2 text-2xl font-black text-white">
                        {formatMoney(derivedStats.totalEarnings)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <TrendChart
                title="Points Trend"
                subtitle="Latest 10 races plotted by final points scored"
                points={derivedStats.pointsTrend}
                accent="bg-red-500/10 text-red-300"
              />
              <TrendChart
                title="Finishing Trend"
                subtitle="Latest 10 race finishes — lower is better"
                points={derivedStats.finishTrend.map((value) => -value)}
                accent="bg-sky-500/10 text-sky-300"
              />
            </section>

            {fromLeagueId && leagueProfile && (
              <section
                id="league-profile"
                className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5"
              >
                <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
                  <div>
                    <h2 className="text-lg font-semibold">League Profile</h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      Profile details are saved only for this league.
                    </p>

                    {leagueProfile.canEdit ? (
                      <div className="mt-4 space-y-3">
                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                          <p className="text-xs uppercase tracking-widest text-zinc-500">
                            iRacing Synced Identity
                          </p>
                          <p className="mt-2 text-sm font-semibold text-zinc-100">
                            {leagueProfile.targetProfile.displayName}
                          </p>
                          <p className="mt-1 text-xs text-zinc-400">
                            Location:{" "}
                            {leagueProfile.targetProfile.country ?? "Not set"}
                          </p>
                          <p className="mt-2 text-xs text-zinc-500">
                            Name and location come from iRacing. Use resync
                            after updating iRacing.
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            Last synced:{" "}
                            {new Date(
                              leagueProfile.targetProfile.lastSyncedAt,
                            ).toLocaleString()}
                          </p>
                          <div className="mt-3">
                            <button
                              onClick={handleResyncLeagueProfile}
                              disabled={profileResyncing}
                              className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition-colors hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {profileResyncing
                                ? "Syncing from iRacing..."
                                : "Resync from iRacing"}
                            </button>
                          </div>
                        </div>

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
                        <p className="text-xs uppercase tracking-widest text-zinc-500">
                          iRacing Synced Identity
                        </p>
                        <p className="mt-2 text-sm text-zinc-400">
                          Location:{" "}
                          {leagueProfile.targetProfile.country ?? "Not set"}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          Last synced:{" "}
                          {new Date(
                            leagueProfile.targetProfile.lastSyncedAt,
                          ).toLocaleString()}
                        </p>
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

            <section className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    Searchable Performance Hub
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Filter league cards and race history with one search term.
                  </p>
                </div>
                <div className="w-full lg:max-w-md">
                  <input
                    value={historySearch}
                    onChange={(event) => setHistorySearch(event.target.value)}
                    placeholder="Search league, series, season, event, track, or notes"
                    className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-red-500"
                  />
                </div>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        League Breakdown
                      </h3>
                      <p className="mt-1 text-xs text-zinc-500">
                        Performance and points by league.
                      </p>
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
                      {filteredLeagues.length} leagues
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {filteredLeagues.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500">
                        No leagues match your search.
                      </div>
                    ) : (
                      filteredLeagues.map((league) => {
                        const pointsShare =
                          data.summary.totalPoints > 0
                            ? Math.min(
                                100,
                                (league.totalPoints /
                                  data.summary.totalPoints) *
                                  100,
                              )
                            : 0;

                        return (
                          <div
                            key={league.leagueId}
                            className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <Link
                                  href={`/app/${league.iracingLeagueId}`}
                                  className="text-base font-semibold text-white transition-colors hover:text-red-400"
                                >
                                  {league.leagueName}
                                </Link>
                                <p className="mt-1 text-xs text-zinc-500">
                                  League #{league.iracingLeagueId}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-black text-white">
                                  {formatCompactNumber(league.totalPoints)}
                                </p>
                                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                                  Points
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-red-500 via-orange-400 to-amber-300"
                                style={{ width: `${pointsShare}%` }}
                              />
                            </div>

                            <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs text-zinc-400">
                              <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-2 py-3">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                                  Starts
                                </p>
                                <p className="mt-2 text-lg font-bold text-white">
                                  {league.starts}
                                </p>
                              </div>
                              <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-2 py-3">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                                  Wins
                                </p>
                                <p className="mt-2 text-lg font-bold text-white">
                                  {league.wins}
                                </p>
                              </div>
                              <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 px-2 py-3">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                                  Top 5
                                </p>
                                <p className="mt-2 text-lg font-bold text-white">
                                  {league.top5}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
                  <h3 className="text-sm font-semibold text-white">
                    Snapshot Metrics
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    Quick readouts pulled from the filtered driver dataset.
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                        Podium Rate
                      </p>
                      <p className="mt-2 text-2xl font-black text-white">
                        {data.summary.starts > 0
                          ? `${Math.round((derivedStats.podiums / data.summary.starts) * 100)}%`
                          : "0%"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                        Win Rate
                      </p>
                      <p className="mt-2 text-2xl font-black text-white">
                        {data.summary.starts > 0
                          ? `${Math.round((data.summary.wins / data.summary.starts) * 100)}%`
                          : "0%"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                        Avg Incidents
                      </p>
                      <p className="mt-2 text-2xl font-black text-white">
                        {formatCompactNumber(derivedStats.avgIncidents)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                        Search Results
                      </p>
                      <p className="mt-2 text-2xl font-black text-white">
                        {filteredResults.length}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
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

            <section className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    Race History Explorer
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Searchable results with league and event context built in.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                      Visible Races
                    </p>
                    <p className="mt-2 text-xl font-black text-white">
                      {filteredResults.length}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                      Wins Shown
                    </p>
                    <p className="mt-2 text-xl font-black text-white">
                      {
                        filteredResults.filter(
                          (result) => result.finishPosition === 1,
                        ).length
                      }
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                      Avg Finish
                    </p>
                    <p className="mt-2 text-xl font-black text-white">
                      {formatCompactNumber(
                        filteredResults.length > 0
                          ? filteredResults.reduce(
                              (sum, result) =>
                                sum + (result.finishPosition ?? 0),
                              0,
                            ) /
                              Math.max(
                                filteredResults.filter(
                                  (result) => result.finishPosition != null,
                                ).length,
                                1,
                              )
                          : null,
                      )}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-3">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                      Earnings
                    </p>
                    <p className="mt-2 text-xl font-black text-white">
                      {formatMoney(
                        filteredResults.reduce(
                          (sum, result) => sum + (result.virtualEarnings ?? 0),
                          0,
                        ),
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {data.results.length === 0 ? (
                <p className="mt-4 text-sm text-zinc-500">No results found.</p>
              ) : filteredResults.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-dashed border-zinc-800 px-4 py-10 text-center text-sm text-zinc-500">
                  No results match your current search.
                </div>
              ) : (
                <div className="mt-6 overflow-x-auto rounded-2xl border border-zinc-800">
                  <table className="w-full min-w-[920px] text-sm">
                    <thead className="bg-zinc-900/80 text-zinc-500 text-xs uppercase tracking-widest">
                      <tr>
                        <th className="text-left px-4 py-3">Date</th>
                        <th className="text-left px-4 py-3">League</th>
                        <th className="text-left px-4 py-3">Series / Season</th>
                        <th className="text-left px-4 py-3">Event</th>
                        <th className="text-right px-4 py-3">Fin</th>
                        <th className="text-right px-4 py-3">Start</th>
                        <th className="text-right px-4 py-3">Pts</th>
                        <th className="text-right px-4 py-3">Earn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResults.map((result) => (
                        <tr
                          key={result.id}
                          className="border-t border-zinc-800 transition-colors hover:bg-zinc-900/40"
                        >
                          <td className="px-4 py-3 text-xs text-zinc-400">
                            {new Date(
                              result.raceSession.launchAt,
                            ).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/app/${result.raceSession.league.iracingLeagueId}`}
                              className="font-medium text-zinc-200 transition-colors hover:text-red-400"
                            >
                              {result.raceSession.league.leagueName}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-400">
                            {result.raceSession.series.name} ·{" "}
                            {result.raceSession.season.seasonName}
                          </td>
                          <td className="px-4 py-3 text-zinc-300">
                            <div>
                              <p className="font-medium text-white">
                                {result.raceSession.schedule?.raceName ??
                                  result.raceSession.trackName ??
                                  "Race"}
                              </p>
                              {result.notes && (
                                <p className="mt-1 text-xs text-zinc-500">
                                  {result.notes}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-zinc-200">
                            {result.finishPosition ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-zinc-500">
                            {result.startPosition ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-zinc-100">
                            {formatCompactNumber(result.finalPoints)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-zinc-200">
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
