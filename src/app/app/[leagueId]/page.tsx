"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  calculateLandingStats,
  flattenUpcomingEvents,
  fmtDate,
  fmtPoints,
  fmtTime,
  formatStages,
  getActiveSeries,
  getRegistrationState,
  pickFeaturedNextRace,
  readJsonSafely,
  relativeEventLabel,
  formatWeather,
  timeUntilEvent,
} from "./landing-utils";
import { formatMoney } from "@/lib/money";

interface StandingEntry {
  custId: number;
  displayName: string;
  points: number;
  starts: number;
  wins: number;
  top5: number;
  avgFinish: number | null;
  gapToLeader: number;
}

interface NextEvent {
  id: string;
  eventDate: string;
  raceName: string;
  isOffWeek: boolean;
  pointsCount: boolean;
  canDrop: boolean;
  registrationEnabled: boolean;
  registrationCount: number;
  isRegisteredByMe: boolean;
  registeredMembers: Array<{
    id: string;
    createdAt: string;
    member: {
      id: string;
      custId: number;
      displayName: string;
      carNumber: string | null;
      nickName: string | null;
    };
  }>;
  trackName: string | null;
  trackId: number | null;
  raceLength: string | null;
  raceOrder: number;
  iracingSessionId: number | null;
  weather: Record<string, unknown>;
  roomOpenTime: string | null;
  greenFlagTime: string | null;
  stages: Array<{ stageNumber: number; endLap: number }> | null;
  importedSession: {
    id: string;
    iracingSessionId: number | null;
    subsessionId: number | null;
    hasResults: boolean;
    trackName: string | null;
    winnerName: string | null;
    winnerCustId: number | null;
    launchAt: string;
    status: number | null;
    _count: { results: number };
  } | null;
}

interface LastRaceResult {
  id: string;
  launchAt: string;
  trackName: string | null;
  winnerName: string | null;
  winnerCustId: number | null;
  iracingSessionId: number | null;
  subsessionId: number | null;
  schedule: {
    id: string;
    raceName: string;
    eventDate: string;
    raceOrder: number;
  } | null;
  results: Array<{
    id: string;
    custId: number;
    displayName: string;
    finishPosition: number | null;
    startPosition: number | null;
    lapsCompleted: number | null;
    incidents: number | null;
    finalPoints: number;
    virtualEarnings: number | null;
    provisional: boolean;
  }>;
}

interface SeriesCard {
  id: string;
  name: string;
  description: string | null;
  season: {
    id: string;
    seasonName: string;
    description: string | null;
    iracingSeasonId: number | null;
  } | null;
  nextEvent: NextEvent | null;
  lastRaceResult: LastRaceResult | null;
  standings: StandingEntry[];
}

interface LandingPayload {
  league: {
    id: string;
    iracingLeagueId: number | null;
    routeLeagueId: string;
    leagueName: string;
    smallLogo: string | null;
    largeLogo: string | null;
    rosterCount: number | null;
    about: string | null;
    message: string | null;
    recruiting: {
      open: boolean;
      series: Array<{ id: string; name: string }>;
    };
  };
  isAdmin: boolean;
  canSelfRegister: boolean;
  isLeagueMember: boolean;
  viewer: {
    iracingCustId: number;
    displayName: string | null;
    country: string | null;
  } | null;
  currentJoinRequest: {
    id: string;
    status: "PENDING";
    createdAt: string;
    requestedSeries: Array<{ id: string; name: string }>;
  } | null;
  series: SeriesCard[];
}

type SeriesPanel = "overview" | "results" | "standings";

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/70 px-4 py-6 text-center">
      <p className="text-sm font-semibold text-zinc-200">{title}</p>
      <p className="mt-1 text-sm text-zinc-500">{body}</p>
    </div>
  );
}

export default function LeaguePage() {
  const { session, loading: authLoading, logout } = useAuth();
  const params = useParams<{ leagueId: string }>();

  const [data, setData] = useState<LandingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registeringScheduleId, setRegisteringScheduleId] = useState<
    string | null
  >(null);
  const [registrationError, setRegistrationError] = useState<string | null>(
    null,
  );
  const [showJoinRequestForm, setShowJoinRequestForm] = useState(false);
  const [submittingJoinRequest, setSubmittingJoinRequest] = useState(false);
  const [joinRequestError, setJoinRequestError] = useState<string | null>(null);
  const [joinIracingId, setJoinIracingId] = useState("");
  const [joinFullName, setJoinFullName] = useState("");
  const [joinState, setJoinState] = useState("");
  const [joinCountry, setJoinCountry] = useState("");
  const [joinWhy, setJoinWhy] = useState("");
  const [joinSeriesIds, setJoinSeriesIds] = useState<string[]>([]);
  const [activeSeriesId, setActiveSeriesId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<SeriesPanel>("overview");

  const loadLanding = useCallback(async () => {
    try {
      const landingRes = await fetch(
        `/api/leagues/${params.leagueId}/landing`,
        {
          cache: "no-store",
        },
      );

      const landingPayload = await readJsonSafely<
        LandingPayload & { error?: string }
      >(landingRes);

      if (!landingRes.ok || !landingPayload) {
        throw new Error(
          landingPayload?.error ?? `fetch_failed_${landingRes.status}`,
        );
      }

      setData(landingPayload);
      setJoinIracingId(
        landingPayload.viewer
          ? String(landingPayload.viewer.iracingCustId)
          : "",
      );
      setJoinFullName(landingPayload.viewer?.displayName ?? "");
      setJoinCountry(landingPayload.viewer?.country ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed_to_load_landing");
    } finally {
      setLoading(false);
    }
  }, [params.leagueId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadLanding();
    });
  }, [loadLanding]);

  function toggleJoinSeries(seriesId: string, checked: boolean) {
    setJoinSeriesIds((previous) => {
      if (checked) {
        if (previous.includes(seriesId)) return previous;
        return [...previous, seriesId];
      }
      return previous.filter((id) => id !== seriesId);
    });
  }

  async function handleJoinRequestSubmit(event: FormEvent) {
    event.preventDefault();
    if (!data) return;

    setSubmittingJoinRequest(true);
    setJoinRequestError(null);

    try {
      const response = await fetch(
        `/api/leagues/${data.league.id}/join-requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            iracingId: Number.parseInt(joinIracingId, 10),
            fullName: joinFullName,
            state: joinState,
            country: joinCountry,
            whyJoin: joinWhy,
            seriesIds: joinSeriesIds,
          }),
        },
      );

      const payload = await readJsonSafely<{
        error?: string;
        message?: string;
        id?: string;
        status?: "PENDING";
        createdAt?: string;
        requestedSeries?: Array<{ id: string; name: string }>;
      }>(response);

      if (!response.ok) {
        throw new Error(
          payload?.message ??
            payload?.error ??
            `join_request_failed_${response.status}`,
        );
      }

      setData((previous) =>
        previous
          ? {
              ...previous,
              currentJoinRequest:
                payload?.id && payload?.status && payload?.createdAt
                  ? {
                      id: payload.id,
                      status: payload.status,
                      createdAt: payload.createdAt,
                      requestedSeries: payload.requestedSeries ?? [],
                    }
                  : previous.currentJoinRequest,
            }
          : previous,
      );

      setShowJoinRequestForm(false);
      setJoinWhy("");
      setJoinSeriesIds([]);
    } catch (err) {
      setJoinRequestError(
        err instanceof Error ? err.message : "join_request_failed",
      );
    } finally {
      setSubmittingJoinRequest(false);
    }
  }

  async function handleRegistrationToggle(
    scheduleId: string,
    isRegistered: boolean,
  ) {
    if (!data?.league.id) return;

    setRegisteringScheduleId(scheduleId);
    setRegistrationError(null);

    try {
      const res = await fetch(
        `/api/leagues/${data.league.id}/schedules/${scheduleId}/registration`,
        {
          method: isRegistered ? "DELETE" : "POST",
        },
      );

      const payload = await readJsonSafely<{
        error?: string;
        message?: string;
      }>(res);

      if (!res.ok) {
        throw new Error(
          payload?.message ??
            payload?.error ??
            `registration_failed_${res.status}`,
        );
      }

      await loadLanding();
    } catch (err) {
      setRegistrationError(
        err instanceof Error ? err.message : "registration_failed",
      );
    } finally {
      setRegisteringScheduleId(null);
    }
  }

  const stats = useMemo(() => calculateLandingStats(data), [data]);
  const heroBackground =
    data?.league.largeLogo ?? data?.league.smallLogo ?? null;
  const featuredNextRace = useMemo(
    () => pickFeaturedNextRace(data?.series ?? []),
    [data?.series],
  );
  const upcomingTicker = useMemo(
    () => flattenUpcomingEvents(data?.series ?? []).slice(0, 8),
    [data?.series],
  );
  const activeSeries = useMemo(
    () => getActiveSeries(data?.series ?? [], activeSeriesId),
    [data?.series, activeSeriesId],
  );

  const featuredNextRaceRegistrationState = featuredNextRace
    ? getRegistrationState({
        eventDate: featuredNextRace.event.eventDate,
        registrationEnabled: featuredNextRace.event.registrationEnabled,
        hasResults: Boolean(featuredNextRace.event.importedSession?.hasResults),
      })
    : null;

  const activeSeriesRegistrationState = activeSeries?.nextEvent
    ? getRegistrationState({
        eventDate: activeSeries.nextEvent.eventDate,
        registrationEnabled: activeSeries.nextEvent.registrationEnabled,
        hasResults: Boolean(activeSeries.nextEvent.importedSession?.hasResults),
      })
    : null;

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
      </div>
    );
  }

  const isAuthenticated = Boolean(session?.authenticated);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link
            href={isAuthenticated ? "/dashboard" : "/"}
            className="text-xl font-black tracking-tight transition-opacity hover:opacity-80"
          >
            i<span className="text-red-500">Race</span>Hub
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href={isAuthenticated ? "/dashboard" : "/"}
              className="text-sm text-zinc-400 transition-colors hover:text-white"
            >
              {isAuthenticated ? "← Dashboard" : "← Home"}
            </Link>
            {isAuthenticated ? (
              <button
                onClick={logout}
                className="rounded-lg border border-zinc-700 px-4 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
              >
                Sign out
              </button>
            ) : (
              <Link
                href="/"
                className="rounded-lg border border-zinc-700 px-4 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        {error ? (
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <Link
              href={isAuthenticated ? "/dashboard" : "/"}
              className="mt-4 inline-block text-sm text-zinc-400 hover:text-white"
            >
              {isAuthenticated ? "← Back to Dashboard" : "← Back Home"}
            </Link>
          </div>
        ) : data ? (
          <div className="space-y-8">
            <section className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900">
              {heroBackground && (
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-cover bg-center opacity-20"
                  style={{ backgroundImage: `url(${heroBackground})` }}
                />
              )}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.26),transparent_35%),linear-gradient(to_bottom_right,rgba(24,24,27,0.52),rgba(9,9,11,0.9))]" />

              <div className="relative grid gap-6 px-6 py-8 lg:grid-cols-[1.35fr_0.95fr] lg:px-8 lg:py-10">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-red-800/50 bg-red-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-300">
                      Next Upcoming Event
                    </span>
                    {data.isAdmin && (
                      <span className="rounded-full border border-blue-800/50 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
                        Admin Access
                      </span>
                    )}
                  </div>

                  {featuredNextRace ? (
                    <div className="relative overflow-hidden rounded-2xl border border-red-500/50 bg-gradient-to-br from-red-950/50 via-zinc-900 to-zinc-950 p-6 shadow-lg shadow-red-500/10">
                      {/* Background glow effect */}
                      <div className="absolute -inset-1 -z-10 bg-gradient-to-r from-red-500/20 via-transparent to-orange-500/20 opacity-50 blur-xl" />

                      <div className="relative">
                        {/* Header with race name */}
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                              <span className="rounded-full border border-red-500/60 bg-red-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-red-300">
                                ⚡ Next Race
                              </span>
                              {timeUntilEvent(featuredNextRace.event.eventDate)
                                .isImminent && (
                                <span className="animate-pulse rounded-full border border-yellow-500/60 bg-yellow-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-yellow-300">
                                  🔥 Imminent
                                </span>
                              )}
                            </div>
                            <h2 className="text-2xl sm:text-3xl font-black text-white">
                              {featuredNextRace.event.raceName}
                            </h2>
                            <p className="mt-2 text-sm text-zinc-300">
                              {featuredNextRace.seriesName}
                              {featuredNextRace.seasonName
                                ? ` · ${featuredNextRace.seasonName}`
                                : ""}
                            </p>
                          </div>
                        </div>

                        {/* Time and track info grid */}
                        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/60 p-3 backdrop-blur">
                            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-1">
                              🏁 Green Flag
                            </p>
                            <p className="text-sm font-bold text-white">
                              {fmtTime(
                                featuredNextRace.event.greenFlagTime ||
                                  featuredNextRace.event.eventDate,
                              )}
                            </p>
                            <p className="text-xs text-zinc-400 mt-1">
                              {fmtDate(featuredNextRace.event.eventDate)}
                            </p>
                          </div>

                          {featuredNextRace.event.roomOpenTime && (
                            <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/60 p-3 backdrop-blur">
                              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-1">
                                🚪 Room Opens
                              </p>
                              <p className="text-sm font-bold text-white">
                                {fmtTime(featuredNextRace.event.roomOpenTime)}
                              </p>
                              <p className="text-xs text-zinc-400 mt-1">
                                {Math.round(
                                  (new Date(
                                    featuredNextRace.event.eventDate,
                                  ).getTime() -
                                    new Date(
                                      featuredNextRace.event.roomOpenTime,
                                    ).getTime()) /
                                    (1000 * 60),
                                )}{" "}
                                min before
                              </p>
                            </div>
                          )}

                          <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/60 p-3 backdrop-blur">
                            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-1">
                              🏆 Track
                            </p>
                            <p className="text-sm font-bold text-white">
                              {featuredNextRace.event.importedSession
                                ?.trackName ??
                                featuredNextRace.event.trackName ??
                                "Track TBD"}
                            </p>
                            {featuredNextRace.event.raceLength && (
                              <p className="text-xs text-zinc-400 mt-1">
                                {featuredNextRace.event.raceLength}
                              </p>
                            )}
                          </div>

                          <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/60 p-3 backdrop-blur">
                            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-1">
                              🌤️ Weather
                            </p>
                            <p className="text-sm font-bold text-white">
                              {formatWeather(featuredNextRace.event.weather)}
                            </p>
                          </div>

                          {formatStages(featuredNextRace.event.stages) && (
                            <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/60 p-3 backdrop-blur">
                              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-1">
                                🏁 Stages
                              </p>
                              <p className="text-sm font-bold text-white">
                                {formatStages(featuredNextRace.event.stages)}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Registration and info section */}
                        <div className="mt-5 flex flex-col sm:flex-row gap-3 items-stretch">
                          <div className="flex-1">
                            <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/60 p-3 backdrop-blur h-full flex flex-col justify-center">
                              <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-1">
                                👥 Registered
                              </p>
                              <p className="text-lg font-bold text-white">
                                {featuredNextRace.event.registrationCount}{" "}
                                driver
                                {featuredNextRace.event.registrationCount !== 1
                                  ? "s"
                                  : ""}
                              </p>
                              {featuredNextRace.event.isRegisteredByMe && (
                                <p className="text-xs text-green-400 mt-1 font-semibold">
                                  ✓ You&apos;re registered
                                </p>
                              )}
                            </div>
                          </div>

                          {!featuredNextRaceRegistrationState?.isClosed &&
                            isAuthenticated &&
                            data.isLeagueMember && (
                              <button
                                onClick={() =>
                                  void handleRegistrationToggle(
                                    featuredNextRace.event.id,
                                    featuredNextRace.event.isRegisteredByMe,
                                  )
                                }
                                disabled={
                                  registeringScheduleId ===
                                  featuredNextRace.event.id
                                }
                                className={`px-6 py-3 rounded-xl font-semibold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                                  featuredNextRace.event.isRegisteredByMe
                                    ? "border border-red-500/60 bg-red-500/20 text-red-300 hover:bg-red-500/30"
                                    : "border border-green-500/60 bg-gradient-to-r from-green-500/30 to-emerald-500/30 text-green-300 hover:from-green-500/40 hover:to-emerald-500/40 shadow-lg shadow-green-500/20"
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                              >
                                {registeringScheduleId ===
                                featuredNextRace.event.id ? (
                                  <>
                                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    Loading...
                                  </>
                                ) : featuredNextRace.event.isRegisteredByMe ? (
                                  <>
                                    <span>✓</span>
                                    <span>Unregister</span>
                                  </>
                                ) : (
                                  <>
                                    <span>🏁</span>
                                    <span>Register</span>
                                  </>
                                )}
                              </button>
                            )}
                        </div>

                        {registrationError && (
                          <div className="mt-3 rounded-lg border border-red-500/50 bg-red-500/10 p-2 text-xs text-red-300">
                            {registrationError}
                          </div>
                        )}

                        {featuredNextRaceRegistrationState?.helperText && (
                          <div className="mt-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-2 text-xs text-amber-300">
                            {featuredNextRaceRegistrationState.helperText}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                      <h2 className="text-xl font-black text-white sm:text-2xl">
                        No upcoming event
                      </h2>
                      <p className="mt-1 text-sm text-zinc-400">
                        There are no future races scheduled yet.
                      </p>
                    </div>
                  )}

                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-3">
                      <p className="text-xs uppercase tracking-widest text-zinc-500">
                        iRacing
                      </p>
                      <p className="mt-1 text-sm font-semibold text-zinc-200">
                        {data.league.iracingLeagueId != null
                          ? `ID ${data.league.iracingLeagueId}`
                          : "Not linked"}
                      </p>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-3">
                      <p className="text-xs uppercase tracking-widest text-zinc-500">
                        Members
                      </p>
                      <p className="mt-1 text-sm font-semibold text-zinc-200">
                        {stats.memberCount}
                      </p>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-3">
                      <p className="text-xs uppercase tracking-widest text-zinc-500">
                        Series
                      </p>
                      <p className="mt-1 text-sm font-semibold text-zinc-200">
                        {stats.seriesCount}
                      </p>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-3">
                      <p className="text-xs uppercase tracking-widest text-zinc-500">
                        Upcoming
                      </p>
                      <p className="mt-1 text-sm font-semibold text-zinc-200">
                        {stats.nextEvents} events
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Fast Navigation
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {isAuthenticated && (
                        <Link
                          href={`/app/${data.league.routeLeagueId}/teams`}
                          className="rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-500"
                        >
                          Teams & Drivers
                        </Link>
                      )}
                      <Link
                        href={`/app/${data.league.routeLeagueId}/calendar`}
                        className="rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-500"
                      >
                        Calendar & Results
                      </Link>
                      <Link
                        href={`/app/${data.league.routeLeagueId}/standings`}
                        className="rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-500"
                      >
                        Full Standings
                      </Link>
                      {data.isAdmin && (
                        <Link
                          href={`/app/${data.league.routeLeagueId}/admin`}
                          className="rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-500"
                        >
                          Admin Panel
                        </Link>
                      )}
                    </div>
                  </div>

                  {isAuthenticated && !data.isLeagueMember && (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
                      {data.currentJoinRequest ? (
                        <>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
                            Join Request Pending
                          </p>
                          <p className="mt-2 text-sm text-zinc-200">
                            Submitted on{" "}
                            {new Date(
                              data.currentJoinRequest.createdAt,
                            ).toLocaleDateString()}
                            .
                          </p>
                          <p className="mt-2 text-xs text-zinc-400">
                            Requested series:{" "}
                            {data.currentJoinRequest.requestedSeries
                              .map((s) => s.name)
                              .join(", ") || "None"}
                          </p>
                        </>
                      ) : data.league.recruiting.open ? (
                        <>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                            Recruiting
                          </p>
                          <h3 className="mt-2 text-lg font-bold text-white">
                            Request to Join
                          </h3>
                          <p className="mt-1 text-sm text-zinc-400">
                            Apply in a few steps and select the series you want
                            to race.
                          </p>

                          {!showJoinRequestForm ? (
                            <button
                              onClick={() => setShowJoinRequestForm(true)}
                              className="mt-4 rounded-lg border border-red-700/60 px-3 py-1.5 text-sm font-semibold text-red-300 transition-colors hover:border-red-500"
                            >
                              Start Request
                            </button>
                          ) : (
                            <form
                              onSubmit={(event) =>
                                void handleJoinRequestSubmit(event)
                              }
                              className="mt-4 space-y-3"
                            >
                              <input
                                type="number"
                                min="1"
                                value={joinIracingId}
                                onChange={(event) =>
                                  setJoinIracingId(event.target.value)
                                }
                                placeholder="iRacing ID"
                                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
                                required
                              />
                              <input
                                type="text"
                                value={joinFullName}
                                onChange={(event) =>
                                  setJoinFullName(event.target.value)
                                }
                                placeholder="Full Name"
                                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
                                required
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  type="text"
                                  value={joinState}
                                  onChange={(event) =>
                                    setJoinState(event.target.value)
                                  }
                                  placeholder="State"
                                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
                                  required
                                />
                                <input
                                  type="text"
                                  value={joinCountry}
                                  onChange={(event) =>
                                    setJoinCountry(event.target.value)
                                  }
                                  placeholder="Country"
                                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
                                  required
                                />
                              </div>
                              <textarea
                                value={joinWhy}
                                onChange={(event) =>
                                  setJoinWhy(event.target.value)
                                }
                                placeholder="Why would you like to join this league?"
                                rows={3}
                                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
                                required
                              />

                              <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                                  Series you want to run
                                </p>
                                <div className="space-y-1.5">
                                  {data.league.recruiting.series.map(
                                    (series) => (
                                      <label
                                        key={series.id}
                                        className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 text-sm text-zinc-200"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={joinSeriesIds.includes(
                                            series.id,
                                          )}
                                          onChange={(event) =>
                                            toggleJoinSeries(
                                              series.id,
                                              event.target.checked,
                                            )
                                          }
                                          className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-red-500 focus:ring-red-500"
                                        />
                                        {series.name}
                                      </label>
                                    ),
                                  )}
                                </div>
                              </div>

                              {joinRequestError && (
                                <p className="text-xs text-red-400">
                                  {joinRequestError}
                                </p>
                              )}

                              <div className="flex gap-2">
                                <button
                                  type="submit"
                                  disabled={
                                    submittingJoinRequest ||
                                    joinSeriesIds.length === 0
                                  }
                                  className="rounded-lg border border-green-700/60 px-3 py-1.5 text-sm font-semibold text-green-300 transition-colors hover:border-green-500 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {submittingJoinRequest
                                    ? "Submitting..."
                                    : "Submit Request"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowJoinRequestForm(false);
                                    setJoinRequestError(null);
                                  }}
                                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-500"
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                            Recruiting
                          </p>
                          <h3 className="mt-2 text-lg font-bold text-white">
                            Recruiting Closed
                          </h3>
                          <p className="mt-1 text-sm text-zinc-400">
                            This league is not currently accepting join
                            requests.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {upcomingTicker.length > 0 && (
              <section className="rounded-3xl border border-zinc-800 bg-zinc-900/50 p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-lg font-bold text-white">
                    Upcoming Race Ticker
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Click any race to focus its series
                  </p>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  {upcomingTicker.map((item) => (
                    <button
                      key={item.event.id}
                      onClick={() => {
                        setActiveSeriesId(item.seriesId);
                        setActivePanel("overview");
                      }}
                      className={`min-w-[260px] rounded-2xl border px-4 py-3 text-left transition-colors ${
                        activeSeriesId === item.seriesId
                          ? "border-red-700/70 bg-red-950/20"
                          : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700"
                      }`}
                    >
                      <p className="text-xs uppercase tracking-widest text-zinc-500">
                        {item.seriesName}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-zinc-100">
                        {item.event.raceName}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">
                        {fmtDate(item.event.eventDate)} ·{" "}
                        {fmtTime(item.event.eventDate)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {item.event.importedSession?.trackName ??
                          item.event.trackName ??
                          "Track TBD"}
                      </p>
                      {formatStages(item.event.stages) && (
                        <p className="mt-1 text-xs text-zinc-500">
                          {formatStages(item.event.stages)}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {data.series.length === 0 ? (
              <EmptyState
                title="No active series yet"
                body="Create or activate a series to show races, standings, and results on this page."
              />
            ) : activeSeries ? (
              <section className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Series Focus
                    </p>
                    <h2 className="mt-1 text-2xl font-black tracking-tight text-white">
                      {activeSeries.name}
                    </h2>
                    <p className="mt-1 text-sm text-zinc-400">
                      {activeSeries.season?.seasonName ?? "No active season"}
                      {activeSeries.description
                        ? ` · ${activeSeries.description}`
                        : ""}
                    </p>
                  </div>
                  <Link
                    href={`/app/${data.league.routeLeagueId}/calendar?series=${activeSeries.id}`}
                    className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-200 transition-colors hover:border-zinc-500"
                  >
                    Full schedule
                  </Link>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {data.series.map((series) => (
                    <button
                      key={series.id}
                      onClick={() => {
                        setActiveSeriesId(series.id);
                        setRegistrationError(null);
                      }}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors ${
                        series.id === activeSeries.id
                          ? "border-red-700/70 bg-red-950/30 text-red-300"
                          : "border-zinc-700 bg-zinc-950/60 text-zinc-300 hover:border-zinc-500"
                      }`}
                    >
                      {series.name}
                    </button>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {(["overview", "results", "standings"] as const).map(
                    (panel) => (
                      <button
                        key={panel}
                        onClick={() => setActivePanel(panel)}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                          activePanel === panel
                            ? "border-zinc-500 bg-zinc-800 text-white"
                            : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"
                        }`}
                      >
                        {panel}
                      </button>
                    ),
                  )}
                </div>

                <div className="mt-5">
                  {activePanel === "overview" && (
                    <div className="space-y-5">
                      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                              Next Event
                            </p>
                            <h3 className="mt-1 text-lg font-bold text-white">
                              {activeSeries.nextEvent?.raceName ??
                                "No upcoming event"}
                            </h3>
                          </div>
                          {activeSeries.nextEvent && (
                            <span className="rounded-full border border-red-800/40 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-300">
                              {relativeEventLabel(
                                activeSeries.nextEvent.eventDate,
                              )}
                            </span>
                          )}
                        </div>

                        {activeSeries.nextEvent ? (
                          <>
                            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                                <p className="text-xs text-zinc-500">
                                  Date & Time
                                </p>
                                <p className="mt-1 font-medium text-zinc-100">
                                  {fmtDate(activeSeries.nextEvent.eventDate)}
                                </p>
                                <p className="text-zinc-400">
                                  {fmtTime(activeSeries.nextEvent.eventDate)}
                                </p>
                              </div>
                              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                                <p className="text-xs text-zinc-500">Track</p>
                                <p className="mt-1 font-medium text-zinc-100">
                                  {activeSeries.nextEvent.importedSession
                                    ?.trackName ??
                                    activeSeries.nextEvent.trackName ??
                                    "TBD"}
                                </p>
                                <p className="text-zinc-400">
                                  {activeSeries.nextEvent.raceLength ??
                                    "Length TBD"}
                                </p>
                              </div>
                              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                                <p className="text-xs text-zinc-500">Flags</p>
                                <p className="mt-1 text-zinc-200">
                                  {activeSeries.nextEvent.pointsCount
                                    ? "Points race"
                                    : "Non-points event"}
                                </p>
                                <p className="text-zinc-400">
                                  {activeSeries.nextEvent.canDrop
                                    ? "Counts toward drops"
                                    : "No drop marker"}
                                </p>
                              </div>
                              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                                <p className="text-xs text-zinc-500">
                                  Registrations
                                </p>
                                <p className="mt-1 font-medium text-zinc-100">
                                  {activeSeries.nextEvent.registrationEnabled
                                    ? `${activeSeries.nextEvent.registrationCount} driver${activeSeries.nextEvent.registrationCount === 1 ? "" : "s"}`
                                    : "Disabled"}
                                </p>
                                <p className="text-zinc-400">
                                  {activeSeries.nextEvent.isRegisteredByMe
                                    ? "You are registered"
                                    : (activeSeriesRegistrationState?.summaryLabel ??
                                      "Open")}
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                              {activeSeries.nextEvent.registrationEnabled ? (
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <p className="text-sm font-medium text-zinc-100">
                                      {activeSeriesRegistrationState?.helperText ??
                                        (activeSeries.nextEvent.isRegisteredByMe
                                          ? "You are on the grid for this race."
                                          : "Register now to confirm race attendance.")}
                                    </p>
                                    <p className="mt-1 text-xs text-zinc-500">
                                      {data.canSelfRegister
                                        ? "Registration updates instantly for this event."
                                        : isAuthenticated
                                          ? "Your member profile has not been synced yet, so self-registration is unavailable."
                                          : "Sign in and join this league to register for races."}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() =>
                                      handleRegistrationToggle(
                                        activeSeries.nextEvent!.id,
                                        activeSeries.nextEvent!
                                          .isRegisteredByMe,
                                      )
                                    }
                                    disabled={
                                      registeringScheduleId ===
                                        activeSeries.nextEvent.id ||
                                      !data.canSelfRegister ||
                                      activeSeriesRegistrationState?.isClosed
                                    }
                                    className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                      activeSeries.nextEvent.isRegisteredByMe &&
                                      !activeSeriesRegistrationState?.isClosed
                                        ? "border-zinc-700 text-zinc-200 hover:border-red-500/60 hover:text-red-300"
                                        : activeSeriesRegistrationState?.isClosed
                                          ? "border-zinc-800 text-zinc-500"
                                          : "border-green-700/60 text-green-300 hover:border-green-500"
                                    }`}
                                  >
                                    {activeSeriesRegistrationState?.isClosed
                                      ? activeSeriesRegistrationState.actionLabel
                                      : registeringScheduleId ===
                                          activeSeries.nextEvent.id
                                        ? "Saving..."
                                        : activeSeries.nextEvent
                                              .isRegisteredByMe
                                          ? "Unregister"
                                          : "Register"}
                                  </button>
                                </div>
                              ) : (
                                <p className="text-sm text-zinc-500">
                                  Registration is disabled for this event.
                                </p>
                              )}

                              {registrationError &&
                                registeringScheduleId === null && (
                                  <p className="mt-3 text-xs text-red-400">
                                    {registrationError}
                                  </p>
                                )}
                            </div>

                            {data.isAdmin &&
                              activeSeries.nextEvent.registeredMembers.length >
                                0 && (
                                <div className="mt-4 rounded-2xl border border-zinc-800 overflow-hidden">
                                  <div className="bg-zinc-900 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                    Registered Drivers (
                                    {
                                      activeSeries.nextEvent.registeredMembers
                                        .length
                                    }
                                    )
                                  </div>
                                  <div className="divide-y divide-zinc-800">
                                    {activeSeries.nextEvent.registeredMembers.map(
                                      (registration) => (
                                        <div
                                          key={registration.id}
                                          className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                                        >
                                          <p className="truncate text-zinc-100">
                                            {registration.member.displayName}
                                            {registration.member.carNumber
                                              ? ` #${registration.member.carNumber}`
                                              : ""}
                                            {registration.member.nickName
                                              ? ` (${registration.member.nickName})`
                                              : ""}
                                          </p>
                                          <Link
                                            href={`/app/drivers/${registration.member.custId}?league=${data.league.routeLeagueId}`}
                                            className="text-xs text-zinc-400 transition-colors hover:text-white"
                                          >
                                            Profile
                                          </Link>
                                        </div>
                                      ),
                                    )}
                                  </div>
                                </div>
                              )}
                          </>
                        ) : (
                          <EmptyState
                            title="No upcoming event"
                            body="Add or sync a future schedule entry for this series to surface it here."
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {activePanel === "results" && (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                            Last Race Result
                          </p>
                          <h3 className="mt-1 text-lg font-bold text-white">
                            {activeSeries.lastRaceResult?.schedule?.raceName ??
                              "No posted results yet"}
                          </h3>
                        </div>
                        {activeSeries.lastRaceResult?.winnerName && (
                          <span className="rounded-full border border-emerald-800/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                            Winner: {activeSeries.lastRaceResult.winnerName}
                          </span>
                        )}
                      </div>

                      {activeSeries.lastRaceResult ? (
                        <>
                          <div className="mb-4 grid gap-3 text-sm sm:grid-cols-3">
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                              <p className="text-xs text-zinc-500">Date</p>
                              <p className="mt-1 text-zinc-100">
                                {fmtDate(
                                  activeSeries.lastRaceResult.schedule
                                    ?.eventDate ??
                                    activeSeries.lastRaceResult.launchAt,
                                )}
                              </p>
                            </div>
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                              <p className="text-xs text-zinc-500">Track</p>
                              <p className="mt-1 text-zinc-100">
                                {activeSeries.lastRaceResult.trackName ??
                                  "Unknown track"}
                              </p>
                            </div>
                            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                              <p className="text-xs text-zinc-500">
                                Subsession
                              </p>
                              <p className="mt-1 font-mono text-zinc-300">
                                {activeSeries.lastRaceResult.subsessionId ??
                                  "—"}
                              </p>
                            </div>
                          </div>

                          <div className="overflow-x-auto rounded-2xl border border-zinc-800">
                            <table className="min-w-full text-left text-sm">
                              <thead className="bg-zinc-900 text-zinc-400">
                                <tr>
                                  <th className="px-4 py-3 font-medium">Pos</th>
                                  <th className="px-4 py-3 font-medium">
                                    Driver
                                  </th>
                                  <th className="px-4 py-3 font-medium">
                                    Start
                                  </th>
                                  <th className="px-4 py-3 font-medium">
                                    Laps
                                  </th>
                                  <th className="px-4 py-3 font-medium">Inc</th>
                                  <th className="px-4 py-3 font-medium">Pts</th>
                                  <th className="px-4 py-3 font-medium">
                                    Earn
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-800 bg-zinc-950/60">
                                {activeSeries.lastRaceResult.results.map(
                                  (result) => (
                                    <tr
                                      key={result.id}
                                      className="hover:bg-zinc-900/60"
                                    >
                                      <td className="px-4 py-3 text-zinc-100">
                                        {result.finishPosition ?? "—"}
                                      </td>
                                      <td className="px-4 py-3">
                                        <Link
                                          href={`/app/drivers/${result.custId}?league=${data.league.routeLeagueId}`}
                                          className="text-zinc-100 transition-colors hover:text-white"
                                        >
                                          {result.displayName}
                                        </Link>
                                        {result.provisional && (
                                          <span className="ml-2 text-xs text-amber-300">
                                            Prov
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-4 py-3 text-zinc-400">
                                        {result.startPosition ?? "—"}
                                      </td>
                                      <td className="px-4 py-3 text-zinc-400">
                                        {result.lapsCompleted ?? "—"}
                                      </td>
                                      <td className="px-4 py-3 text-zinc-400">
                                        {result.incidents ?? "—"}
                                      </td>
                                      <td className="px-4 py-3 font-medium text-zinc-100">
                                        {fmtPoints(result.finalPoints)}
                                      </td>
                                      <td className="px-4 py-3 font-medium text-zinc-200">
                                        {result.virtualEarnings == null
                                          ? "—"
                                          : formatMoney(result.virtualEarnings)}
                                      </td>
                                    </tr>
                                  ),
                                )}
                              </tbody>
                            </table>
                          </div>
                        </>
                      ) : (
                        <EmptyState
                          title="No results posted"
                          body="Once race results are imported, the latest finishing order appears here."
                        />
                      )}
                    </div>
                  )}

                  {activePanel === "standings" && (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                            Top 10 Standings
                          </p>
                          <h3 className="mt-1 text-lg font-bold text-white">
                            {activeSeries.season?.seasonName ?? "Standings"}
                          </h3>
                        </div>
                        <Link
                          href={`/app/${data.league.routeLeagueId}/standings`}
                          className="text-xs font-semibold text-zinc-400 transition-colors hover:text-white"
                        >
                          Full table →
                        </Link>
                      </div>

                      {activeSeries.standings.length > 0 ? (
                        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
                          <table className="min-w-full text-left text-sm">
                            <thead className="bg-zinc-900 text-zinc-400">
                              <tr>
                                <th className="px-4 py-3 font-medium">Rank</th>
                                <th className="px-4 py-3 font-medium">
                                  Driver
                                </th>
                                <th className="px-4 py-3 font-medium">Pts</th>
                                <th className="px-4 py-3 font-medium">Gap</th>
                                <th className="px-4 py-3 font-medium">Wins</th>
                                <th className="px-4 py-3 font-medium">Top 5</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800 bg-zinc-950/60">
                              {activeSeries.standings.map((entry, index) => (
                                <tr
                                  key={`${activeSeries.id}-${entry.custId}`}
                                  className="hover:bg-zinc-900/60"
                                >
                                  <td className="px-4 py-3 font-semibold text-zinc-100">
                                    {index + 1}
                                  </td>
                                  <td className="px-4 py-3">
                                    <Link
                                      href={`/app/drivers/${entry.custId}?league=${data.league.routeLeagueId}`}
                                      className="text-zinc-100 transition-colors hover:text-white"
                                    >
                                      {entry.displayName}
                                    </Link>
                                  </td>
                                  <td className="px-4 py-3 font-medium text-zinc-100">
                                    {fmtPoints(entry.points)}
                                  </td>
                                  <td className="px-4 py-3 text-zinc-400">
                                    {index === 0
                                      ? "Leader"
                                      : fmtPoints(entry.gapToLeader)}
                                  </td>
                                  <td className="px-4 py-3 text-zinc-400">
                                    {entry.wins}
                                  </td>
                                  <td className="px-4 py-3 text-zinc-400">
                                    {entry.top5}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <EmptyState
                          title="No standings yet"
                          body="Standings appear after results are recorded for points-paying events."
                        />
                      )}
                    </div>
                  )}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}
