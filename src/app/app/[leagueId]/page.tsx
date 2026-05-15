"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
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
  };
  isAdmin: boolean;
  canSelfRegister: boolean;
  series: SeriesCard[];
}

const REGISTRATION_LOCK_WINDOW_MS = 20 * 60 * 1000;

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function fmtPoints(value: number) {
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

function relativeEventLabel(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diff / 86400000);

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) return `In ${diffDays} days`;
  return "Upcoming";
}

function getRegistrationState(args: {
  eventDate: string;
  registrationEnabled: boolean;
  hasResults: boolean;
}) {
  const eventTime = new Date(args.eventDate).getTime();
  const now = Date.now();
  const lockTime = eventTime - REGISTRATION_LOCK_WINDOW_MS;

  if (!args.registrationEnabled) {
    return {
      isClosed: true,
      summaryLabel: "Disabled",
      actionLabel: "Registration Disabled",
      helperText: "Registration is disabled for this event.",
    };
  }

  if (args.hasResults) {
    return {
      isClosed: true,
      summaryLabel: "Results posted",
      actionLabel: "Results Posted",
      helperText:
        "Registration is closed because results have already been posted.",
    };
  }

  if (now >= eventTime) {
    return {
      isClosed: true,
      summaryLabel: "Event passed",
      actionLabel: "Event Passed",
      helperText: "This event has already started or finished.",
    };
  }

  if (now >= lockTime) {
    return {
      isClosed: true,
      summaryLabel: "Closed within 20 min",
      actionLabel: "Registration Closed",
      helperText: "Registration closes 20 minutes before the event start time.",
    };
  }

  return {
    isClosed: false,
    summaryLabel: null,
    actionLabel: null,
    helperText: null,
  };
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

  const stats = useMemo(() => {
    return {
      memberCount: data?.league.rosterCount ?? 0,
      seriesCount: data?.series.length ?? 0,
      nextEvents: data?.series.filter((item) => item.nextEvent).length ?? 0,
    };
  }, [data]);

  const heroBackground =
    data?.league.largeLogo ?? data?.league.smallLogo ?? null;

  const featuredNextRace = useMemo(() => {
    if (!data) return null;

    return (
      data.series
        .filter((series) => series.nextEvent)
        .map((series) => ({
          seriesId: series.id,
          seriesName: series.name,
          seasonName: series.season?.seasonName ?? null,
          event: series.nextEvent!,
        }))
        .sort(
          (a, b) =>
            new Date(a.event.eventDate).getTime() -
            new Date(b.event.eventDate).getTime(),
        )[0] ?? null
    );
  }, [data]);

  const featuredNextRaceRegistrationState = featuredNextRace
    ? getRegistrationState({
        eventDate: featuredNextRace.event.eventDate,
        registrationEnabled: featuredNextRace.event.registrationEnabled,
        hasResults: Boolean(featuredNextRace.event.importedSession?.hasResults),
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
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.22),transparent_35%),linear-gradient(to_bottom_right,rgba(24,24,27,0.45),rgba(9,9,11,0.88))]" />
              <div className="relative grid gap-8 px-6 py-8 lg:grid-cols-[1.4fr_0.9fr] lg:px-8 lg:py-10">
                <div className="flex items-start gap-5">
                  {data.league.smallLogo ? (
                    <Image
                      src={data.league.smallLogo}
                      alt={data.league.leagueName}
                      width={88}
                      height={88}
                      unoptimized
                      className="h-20 w-20 rounded-2xl border border-zinc-800 object-cover shadow-lg shadow-black/30"
                    />
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-800 text-3xl">
                      🏁
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-red-800/50 bg-red-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-red-300">
                        League Landing
                      </span>
                      {data.isAdmin && (
                        <span className="rounded-full border border-blue-800/50 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
                          Admin Access
                        </span>
                      )}
                    </div>
                    <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                      {data.league.leagueName}
                    </h1>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400 sm:text-base">
                      {data.league.message ||
                        data.league.about ||
                        "Track the next event, review the latest race, see current top-10 standings, and manage event registration across every active series."}
                    </p>

                    <div className="mt-5 flex flex-wrap gap-3 text-sm text-zinc-300">
                      <span className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2">
                        {data.league.iracingLeagueId != null
                          ? `iRacing League ID: ${data.league.iracingLeagueId}`
                          : "iRacing League: Not linked yet"}
                      </span>
                      <span className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2">
                        {stats.memberCount} Members
                      </span>
                      <span className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2">
                        {stats.seriesCount} Active Series
                      </span>
                      <span className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2">
                        {stats.nextEvents} Upcoming Events
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  {isAuthenticated && (
                    <Link
                      href={`/app/${data.league.routeLeagueId}/teams`}
                      className="rounded-2xl border border-red-800/50 bg-red-500/10 p-5 text-left transition-colors hover:border-red-700"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-300">
                        Team
                      </p>
                      <h2 className="mt-2 text-lg font-bold text-white">
                        Teams & Drivers
                      </h2>
                      <p className="mt-1 text-sm text-zinc-300">
                        View all teams with driver car numbers and create your
                        own team.
                      </p>
                    </Link>
                  )}
                  <Link
                    href={`/app/${data.league.routeLeagueId}/calendar`}
                    className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 transition-colors hover:border-zinc-700"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Schedule
                    </p>
                    <h2 className="mt-2 text-lg font-bold text-white">
                      Full Calendar & Results
                    </h2>
                    <p className="mt-1 text-sm text-zinc-400">
                      Open the complete event calendar, import race results, and
                      review detailed registrations.
                    </p>
                  </Link>
                  <Link
                    href={`/app/${data.league.routeLeagueId}/standings`}
                    className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 transition-colors hover:border-zinc-700"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Points
                    </p>
                    <h2 className="mt-2 text-lg font-bold text-white">
                      Full Standings View
                    </h2>
                    <p className="mt-1 text-sm text-zinc-400">
                      See every points table beyond the top 10 preview shown
                      below.
                    </p>
                  </Link>
                  {data.isAdmin && (
                    <Link
                      href={`/app/${data.league.routeLeagueId}/admin`}
                      className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5 transition-colors hover:border-zinc-700 sm:col-span-2 lg:col-span-1"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        League Admin
                      </p>
                      <h2 className="mt-2 text-lg font-bold text-white">
                        Open Admin Panel
                      </h2>
                      <p className="mt-1 text-sm text-zinc-400">
                        Manage widgets, schedules, points systems, seasons, and
                        registrations.
                      </p>
                    </Link>
                  )}
                </div>
              </div>
            </section>

            {featuredNextRace && (
              <section className="overflow-hidden rounded-3xl border border-red-900/40 bg-gradient-to-r from-red-950/40 via-zinc-900 to-zinc-950">
                <div className="grid gap-5 px-6 py-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-red-300">
                      Featured Next Race
                    </p>
                    <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
                      {featuredNextRace.event.raceName}
                    </h2>
                    <p className="mt-2 text-sm text-zinc-300 sm:text-base">
                      {featuredNextRace.seriesName}
                      {featuredNextRace.seasonName
                        ? ` · ${featuredNextRace.seasonName}`
                        : ""}
                    </p>
                    <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
                      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                          Date
                        </p>
                        <p className="mt-1 font-semibold text-zinc-100">
                          {fmtDate(featuredNextRace.event.eventDate)}
                        </p>
                        <p className="text-zinc-400">
                          {fmtTime(featuredNextRace.event.eventDate)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                          Track
                        </p>
                        <p className="mt-1 font-semibold text-zinc-100">
                          {featuredNextRace.event.importedSession?.trackName ??
                            featuredNextRace.event.trackName ??
                            "TBD"}
                        </p>
                        <p className="text-zinc-400">
                          {featuredNextRace.event.raceLength ?? "Length TBD"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                          Registration
                        </p>
                        <p className="mt-1 font-semibold text-zinc-100">
                          {featuredNextRace.event.registrationEnabled
                            ? `${featuredNextRace.event.registrationCount} registered`
                            : "Disabled"}
                        </p>
                        <p className="text-zinc-400">
                          {featuredNextRace.event.isRegisteredByMe
                            ? "You are on the list"
                            : (featuredNextRaceRegistrationState?.summaryLabel ??
                              relativeEventLabel(
                                featuredNextRace.event.eventDate,
                              ))}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col justify-between gap-4 rounded-3xl border border-zinc-800 bg-zinc-950/55 p-5">
                    <div>
                      <p className="text-sm text-zinc-300">
                        The soonest green flag across the league. Jump straight
                        into the series schedule or confirm your seat now.
                      </p>
                      {registrationError && registeringScheduleId === null && (
                        <p className="mt-3 text-xs text-red-400">
                          {registrationError}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Link
                        href={`/app/${data.league.routeLeagueId}/calendar?series=${featuredNextRace.seriesId}`}
                        className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-100 transition-colors hover:border-zinc-500 hover:text-white"
                      >
                        Open Schedule
                      </Link>
                      {featuredNextRace.event.registrationEnabled && (
                        <button
                          onClick={() =>
                            handleRegistrationToggle(
                              featuredNextRace.event.id,
                              featuredNextRace.event.isRegisteredByMe,
                            )
                          }
                          disabled={
                            registeringScheduleId ===
                              featuredNextRace.event.id ||
                            !data.canSelfRegister ||
                            featuredNextRaceRegistrationState?.isClosed
                          }
                          className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                            featuredNextRace.event.isRegisteredByMe &&
                            !featuredNextRaceRegistrationState?.isClosed
                              ? "border-zinc-700 text-zinc-200 hover:border-red-500/60 hover:text-red-300"
                              : featuredNextRaceRegistrationState?.isClosed
                                ? "border-zinc-800 text-zinc-500"
                                : "border-green-700/60 text-green-300 hover:border-green-500"
                          }`}
                        >
                          {registeringScheduleId === featuredNextRace.event.id
                            ? "Saving..."
                            : featuredNextRaceRegistrationState?.isClosed
                              ? featuredNextRaceRegistrationState.actionLabel
                              : featuredNextRace.event.isRegisteredByMe
                                ? "Unregister"
                                : "Register for Race"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}

            <section className="space-y-6">
              {data.series.length === 0 ? (
                <EmptyState
                  title="No active series yet"
                  body="Create or activate a series to show the next event, latest race result, and standings on this page."
                />
              ) : (
                data.series.map((series) => {
                  const nextEvent = series.nextEvent;
                  const lastRace = series.lastRaceResult;
                  const isRegistering = registeringScheduleId === nextEvent?.id;
                  const nextEventRegistrationState = nextEvent
                    ? getRegistrationState({
                        eventDate: nextEvent.eventDate,
                        registrationEnabled: nextEvent.registrationEnabled,
                        hasResults: Boolean(
                          nextEvent.importedSession?.hasResults,
                        ),
                      })
                    : null;

                  return (
                    <section
                      key={series.id}
                      className="overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/60"
                    >
                      <div className="border-b border-zinc-800 bg-zinc-900/80 px-5 py-4 sm:px-6">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h2 className="text-2xl font-black tracking-tight text-white">
                              {series.name}
                            </h2>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                              <span>
                                {series.season?.seasonName ??
                                  "No active season"}
                              </span>
                              {series.description && (
                                <span>· {series.description}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-zinc-700 bg-zinc-950/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                              {series.standings.length} in standings
                            </span>
                            <Link
                              href={`/app/${data.league.routeLeagueId}/calendar?series=${series.id}`}
                              className="rounded-full border border-zinc-700 bg-zinc-950/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
                            >
                              Full schedule & results →
                            </Link>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[1.15fr_1fr]">
                        <div className="space-y-6">
                          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5">
                            <div className="mb-4 flex items-center justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                  Next Event
                                </p>
                                <h3 className="mt-1 text-lg font-bold text-white">
                                  {nextEvent?.raceName ?? "No upcoming event"}
                                </h3>
                              </div>
                              {nextEvent && (
                                <span className="rounded-full border border-red-800/40 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-300">
                                  {relativeEventLabel(nextEvent.eventDate)}
                                </span>
                              )}
                            </div>

                            {nextEvent ? (
                              <>
                                <div className="grid gap-3 text-sm sm:grid-cols-2">
                                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                                    <p className="text-xs text-zinc-500">
                                      Date & Time
                                    </p>
                                    <p className="mt-1 font-medium text-zinc-100">
                                      {fmtDate(nextEvent.eventDate)}
                                    </p>
                                    <p className="text-zinc-400">
                                      {fmtTime(nextEvent.eventDate)}
                                    </p>
                                  </div>
                                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                                    <p className="text-xs text-zinc-500">
                                      Track
                                    </p>
                                    <p className="mt-1 font-medium text-zinc-100">
                                      {nextEvent.importedSession?.trackName ??
                                        nextEvent.trackName ??
                                        "TBD"}
                                    </p>
                                    <p className="text-zinc-400">
                                      {nextEvent.raceLength ?? "Length TBD"}
                                    </p>
                                  </div>
                                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                                    <p className="text-xs text-zinc-500">
                                      Race Flags
                                    </p>
                                    <p className="mt-1 text-zinc-200">
                                      {nextEvent.pointsCount
                                        ? "Points race"
                                        : "Non-points event"}
                                    </p>
                                    <p className="text-zinc-400">
                                      {nextEvent.canDrop
                                        ? "Counts toward drops"
                                        : "No drop marker"}
                                    </p>
                                  </div>
                                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                                    <p className="text-xs text-zinc-500">
                                      Registrations
                                    </p>
                                    <p className="mt-1 font-medium text-zinc-100">
                                      {nextEvent.registrationEnabled
                                        ? `${nextEvent.registrationCount} driver${nextEvent.registrationCount === 1 ? "" : "s"}`
                                        : "Disabled"}
                                    </p>
                                    <p className="text-zinc-400">
                                      {nextEvent.isRegisteredByMe
                                        ? "You are registered"
                                        : (nextEventRegistrationState?.summaryLabel ??
                                          "Open for driver sign-up")}
                                    </p>
                                  </div>
                                </div>

                                <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                                  {nextEvent.registrationEnabled ? (
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                      <div>
                                        <p className="text-sm font-medium text-zinc-100">
                                          {nextEventRegistrationState?.helperText ??
                                            (nextEvent.isRegisteredByMe
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
                                            nextEvent.id,
                                            nextEvent.isRegisteredByMe,
                                          )
                                        }
                                        disabled={
                                          isRegistering ||
                                          !data.canSelfRegister ||
                                          nextEventRegistrationState?.isClosed
                                        }
                                        className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                          nextEvent.isRegisteredByMe &&
                                          !nextEventRegistrationState?.isClosed
                                            ? "border-zinc-700 text-zinc-200 hover:border-red-500/60 hover:text-red-300"
                                            : nextEventRegistrationState?.isClosed
                                              ? "border-zinc-800 text-zinc-500"
                                              : "border-green-700/60 text-green-300 hover:border-green-500"
                                        }`}
                                      >
                                        {nextEventRegistrationState?.isClosed
                                          ? nextEventRegistrationState.actionLabel
                                          : isRegistering
                                            ? "Saving..."
                                            : nextEvent.isRegisteredByMe
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
                                  nextEvent.registeredMembers.length > 0 && (
                                    <div className="mt-4 rounded-2xl border border-zinc-800 overflow-hidden">
                                      <div className="bg-zinc-900 px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                        Registered Drivers (
                                        {nextEvent.registeredMembers.length})
                                      </div>
                                      <div className="divide-y divide-zinc-800">
                                        {nextEvent.registeredMembers.map(
                                          (registration) => (
                                            <div
                                              key={registration.id}
                                              className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                                            >
                                              <div className="min-w-0">
                                                <p className="truncate text-zinc-100">
                                                  {
                                                    registration.member
                                                      .displayName
                                                  }
                                                  {registration.member.carNumber
                                                    ? ` #${registration.member.carNumber}`
                                                    : ""}
                                                  {registration.member.nickName
                                                    ? ` (${registration.member.nickName})`
                                                    : ""}
                                                </p>
                                              </div>
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

                          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5">
                            <div className="mb-4 flex items-center justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                  Last Race Result
                                </p>
                                <h3 className="mt-1 text-lg font-bold text-white">
                                  {lastRace?.schedule?.raceName ??
                                    "No posted results yet"}
                                </h3>
                              </div>
                              {lastRace?.winnerName && (
                                <span className="rounded-full border border-emerald-800/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                                  Winner: {lastRace.winnerName}
                                </span>
                              )}
                            </div>

                            {lastRace ? (
                              <>
                                <div className="mb-4 grid gap-3 text-sm sm:grid-cols-3">
                                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                                    <p className="text-xs text-zinc-500">
                                      Date
                                    </p>
                                    <p className="mt-1 text-zinc-100">
                                      {fmtDate(
                                        lastRace.schedule?.eventDate ??
                                          lastRace.launchAt,
                                      )}
                                    </p>
                                  </div>
                                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                                    <p className="text-xs text-zinc-500">
                                      Track
                                    </p>
                                    <p className="mt-1 text-zinc-100">
                                      {lastRace.trackName ?? "Unknown track"}
                                    </p>
                                  </div>
                                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                                    <p className="text-xs text-zinc-500">
                                      Subsession
                                    </p>
                                    <p className="mt-1 font-mono text-zinc-300">
                                      {lastRace.subsessionId ?? "—"}
                                    </p>
                                  </div>
                                </div>

                                <div className="overflow-x-auto rounded-2xl border border-zinc-800">
                                  <table className="min-w-full text-left text-sm">
                                    <thead className="bg-zinc-900 text-zinc-400">
                                      <tr>
                                        <th className="px-4 py-3 font-medium">
                                          Pos
                                        </th>
                                        <th className="px-4 py-3 font-medium">
                                          Driver
                                        </th>
                                        <th className="px-4 py-3 font-medium">
                                          Start
                                        </th>
                                        <th className="px-4 py-3 font-medium">
                                          Laps
                                        </th>
                                        <th className="px-4 py-3 font-medium">
                                          Inc
                                        </th>
                                        <th className="px-4 py-3 font-medium">
                                          Pts
                                        </th>
                                        <th className="px-4 py-3 font-medium">
                                          Earn
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800 bg-zinc-950/60">
                                      {lastRace.results.map((result) => (
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
                                              : formatMoney(
                                                  result.virtualEarnings,
                                                )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </>
                            ) : (
                              <EmptyState
                                title="No results posted"
                                body="Once race results are imported for this series, the latest finishing order will show here."
                              />
                            )}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 sm:p-5">
                          <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                                Top 10 Standings
                              </p>
                              <h3 className="mt-1 text-lg font-bold text-white">
                                {series.season?.seasonName ?? "Standings"}
                              </h3>
                            </div>
                            <Link
                              href={`/app/${data.league.routeLeagueId}/standings`}
                              className="text-xs font-semibold text-zinc-400 transition-colors hover:text-white"
                            >
                              Full table →
                            </Link>
                          </div>

                          {series.standings.length > 0 ? (
                            <div className="overflow-x-auto rounded-2xl border border-zinc-800">
                              <table className="min-w-full text-left text-sm">
                                <thead className="bg-zinc-900 text-zinc-400">
                                  <tr>
                                    <th className="px-4 py-3 font-medium">
                                      Rank
                                    </th>
                                    <th className="px-4 py-3 font-medium">
                                      Driver
                                    </th>
                                    <th className="px-4 py-3 font-medium">
                                      Pts
                                    </th>
                                    <th className="px-4 py-3 font-medium">
                                      Gap
                                    </th>
                                    <th className="px-4 py-3 font-medium">
                                      Wins
                                    </th>
                                    <th className="px-4 py-3 font-medium">
                                      Top 5
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800 bg-zinc-950/60">
                                  {series.standings.map((entry, index) => (
                                    <tr
                                      key={`${series.id}-${entry.custId}`}
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
                              body="Standings will appear here after results are recorded for points-paying events."
                            />
                          )}
                        </div>
                      </div>
                    </section>
                  );
                })
              )}
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}
