"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RaceSessionSummary {
  id: string;
  iracingSessionId: number;
  subsessionId: number | null;
  hasResults: boolean;
  trackName: string | null;
  winnerName: string | null;
  winnerCustId: number | null;
  launchAt: string;
  status: number | null;
  _count: { results: number };
}

interface Schedule {
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
  importedSession: RaceSessionSummary | null;
}

interface Season {
  id: string;
  seasonName: string;
  description: string | null;
  isActive: boolean;
  numDrops: number;
  iracingSeasonId: number | null;
  schedules: Schedule[];
}

interface Series {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  seasons: Season[];
}

interface Result {
  id: string;
  custId: number;
  displayName: string;
  finishPosition: number | null;
  startPosition: number | null;
  lapsCompleted: number | null;
  incidents: number | null;
  provisional: boolean;
  pointsBase: number;
  pointsAdjustment: number;
  finalPoints: number;
  notes: string | null;
}

interface IracingSession {
  session_id: number;
  subsession_id: number;
  launch_at: string;
  has_results: boolean;
  track?: { track_name?: string };
}

const REGISTRATION_LOCK_WINDOW_MS = 20 * 60 * 1000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
      buttonLabel: "Registration Disabled",
      message: "Registration is disabled for this event.",
    };
  }

  if (args.hasResults) {
    return {
      isClosed: true,
      buttonLabel: "Results Posted",
      message:
        "Registration is closed because results have already been posted.",
    };
  }

  if (now >= eventTime) {
    return {
      isClosed: true,
      buttonLabel: "Event Passed",
      message: "This event has already started or finished.",
    };
  }

  if (now >= lockTime) {
    return {
      isClosed: true,
      buttonLabel: "Registration Closed",
      message: "Registration closes 20 minutes before the event start time.",
    };
  }

  return {
    isClosed: false,
    buttonLabel: null,
    message: null,
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

function StatusBadge({
  session,
  eventDate,
}: {
  session: RaceSessionSummary | null;
  eventDate: string;
}) {
  const now = new Date();
  const date = new Date(eventDate);

  if (session?.hasResults) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/40 text-green-400 border border-green-800/50">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
        Results Posted
      </span>
    );
  }
  if (session) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-900/40 text-yellow-400 border border-yellow-800/50">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
        Pending Results
      </span>
    );
  }
  if (date < now) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-700/40 text-zinc-400 border border-zinc-600/50">
        Completed
      </span>
    );
  }
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / 864e5);
  if (diffDays <= 7) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-900/40 text-red-400 border border-red-800/50">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
        {diffDays === 1 ? "Tomorrow" : `In ${diffDays} days`}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-900/40 text-blue-400 border border-blue-800/50">
      Upcoming
    </span>
  );
}

// ─── Admin Import Panel ───────────────────────────────────────────────────────

type ImportTab = "iracing" | "file";

function AdminImportPanel({
  leagueDbId,
  seriesId,
  seasonId,
  raceSessionId,
  subsessionId,
  iracingLeagueId,
  iracingSeasonId,
  onSuccess,
}: {
  leagueDbId: string;
  seriesId: string;
  seasonId: string;
  raceSessionId: string;
  subsessionId: number | null;
  iracingLeagueId: number;
  iracingSeasonId: number | null;
  onSuccess: () => void;
}) {
  const [tab, setTab] = useState<ImportTab>("iracing");
  const [iracingSessions, setIracingSessions] = useState<IracingSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [selectedSubsessionId, setSelectedSubsessionId] = useState(
    subsessionId?.toString() ?? "",
  );
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const baseUrl = `/api/leagues/${leagueDbId}/series/${seriesId}/seasons/${seasonId}/sessions/${raceSessionId}/results/import`;

  // Fetch available iRacing sessions when iRacing tab is active
  useEffect(() => {
    if (tab !== "iracing" || !iracingSeasonId) return;
    let cancelled = false;
    async function run() {
      setLoadingSessions(true);
      try {
        const res = await fetch(
          `/api/iracing/league-season-sessions?league_id=${iracingLeagueId}&season_id=${iracingSeasonId}`,
          { cache: "no-store" },
        );
        if (cancelled || !res.ok) return;
        const data = (await res.json()) as
          | IracingSession[]
          | { sessions?: IracingSession[] };
        const sessions = Array.isArray(data)
          ? data
          : ((data as { sessions?: IracingSession[] }).sessions ?? []);
        if (!cancelled) setIracingSessions(sessions);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoadingSessions(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [tab, iracingLeagueId, iracingSeasonId]);

  const handleImport = async () => {
    setImporting(true);
    setImportError(null);
    try {
      if (tab === "iracing") {
        const id = parseInt(selectedSubsessionId, 10);
        if (isNaN(id)) {
          setImportError("Enter a valid subsession ID.");
          return;
        }
        const res = await fetch(baseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "iracing", subsessionId: id }),
        });
        if (!res.ok) {
          const d = (await res.json()) as { error?: string; message?: string };
          throw new Error(d.message ?? d.error ?? "import_failed");
        }
        const d = (await res.json()) as { imported?: number };
        alert(`Imported ${d.imported ?? 0} results.`);
        onSuccess();
      } else {
        const file = fileInputRef.current?.files?.[0];
        if (!file) {
          setImportError("Please select a file.");
          return;
        }
        const text = await file.text();
        const isJson = file.name.toLowerCase().endsWith(".json");
        const body = isJson
          ? { source: "json", data: JSON.parse(text) }
          : { source: "csv", csvContent: text };
        const res = await fetch(baseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const d = (await res.json()) as { error?: string; message?: string };
          throw new Error(d.message ?? d.error ?? "import_failed");
        }
        const d = (await res.json()) as { imported?: number };
        alert(`Imported ${d.imported ?? 0} results.`);
        onSuccess();
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "import_failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900 p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-3">
        Import Results
      </p>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-zinc-800 rounded-lg p-1 w-fit">
        {(["iracing", "file"] as ImportTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tab === t
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t === "iracing" ? "iRacing Sync" : "Upload File"}
          </button>
        ))}
      </div>

      {tab === "iracing" && (
        <div className="space-y-3">
          {/* Session picker from iRacing */}
          {iracingSeasonId ? (
            loadingSessions ? (
              <p className="text-xs text-zinc-500">
                Loading sessions from iRacing...
              </p>
            ) : iracingSessions.length > 0 ? (
              <div>
                <p className="text-xs text-zinc-500 mb-2">
                  Select a session from this season:
                </p>
                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {iracingSessions.map((s) => (
                    <button
                      key={s.session_id}
                      onClick={() =>
                        setSelectedSubsessionId(s.subsession_id.toString())
                      }
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors ${
                        selectedSubsessionId === s.subsession_id.toString()
                          ? "border-red-600 bg-red-600/10 text-white"
                          : "border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:border-zinc-600"
                      }`}
                    >
                      <span className="font-medium">
                        {s.track?.track_name ?? "Unknown Track"}
                      </span>
                      <span className="ml-2 text-zinc-500 text-xs">
                        {new Date(s.launch_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      {s.has_results && (
                        <span className="ml-2 text-green-500 text-xs">
                          ✓ Has results
                        </span>
                      )}
                      <span className="float-right text-zinc-600 text-xs">
                        Sub #{s.subsession_id}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-500">
                No sessions found from iRacing for this season.
              </p>
            )
          ) : (
            <p className="text-xs text-zinc-500">
              This season is not linked to an iRacing season — enter a
              subsession ID manually.
            </p>
          )}

          {/* Manual subsession ID */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              Subsession ID
              <span className="text-zinc-600 ml-1">(or enter manually)</span>
            </label>
            <input
              type="number"
              value={selectedSubsessionId}
              onChange={(e) => setSelectedSubsessionId(e.target.value)}
              placeholder="e.g. 10127258"
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
            />
          </div>
        </div>
      )}

      {tab === "file" && (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">
            Upload an iRacing event result{" "}
            <strong className="text-zinc-300">.json</strong> or{" "}
            <strong className="text-zinc-300">.csv</strong> file.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.csv"
            className="w-full text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-zinc-700 file:text-zinc-200 hover:file:bg-zinc-600 cursor-pointer"
          />
        </div>
      )}

      {importError && (
        <p className="text-red-400 text-xs mt-3">{importError}</p>
      )}

      <div className="flex justify-end mt-4">
        <button
          onClick={handleImport}
          disabled={importing}
          className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {importing ? "Importing..." : "Import Results"}
        </button>
      </div>
    </div>
  );
}

// ─── Expandable Event Card ────────────────────────────────────────────────────

function EventCard({
  schedule,
  raceNumber,
  leaguePathId,
  isAdmin,
  leagueDbId,
  seriesId,
  seasonId,
  iracingLeagueId,
  iracingSeasonId,
  onSessionUpdated,
}: {
  schedule: Schedule;
  raceNumber: number;
  leaguePathId: string;
  isAdmin: boolean;
  leagueDbId: string;
  seriesId: string;
  seasonId: string;
  iracingLeagueId: number;
  iracingSeasonId: number | null;
  onSessionUpdated: () => void;
}) {
  const session = schedule.importedSession;
  const [expanded, setExpanded] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(
    null,
  );
  const pastDate = new Date(schedule.eventDate) < new Date();
  const registrationState = getRegistrationState({
    eventDate: schedule.eventDate,
    registrationEnabled: schedule.registrationEnabled,
    hasResults: Boolean(session?.hasResults),
  });

  const fetchResults = useCallback(async () => {
    if (!session?.id) return;
    setLoadingResults(true);
    try {
      const res = await fetch(
        `/api/leagues/${leagueDbId}/series/${seriesId}/seasons/${seasonId}/sessions/${session.id}/results`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const data = (await res.json()) as { results?: Result[] };
        setResults(data.results ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingResults(false);
    }
  }, [leagueDbId, seriesId, seasonId, session]);

  const handleToggle = () => {
    if (!expanded && session && results === null) {
      fetchResults();
    }
    setExpanded((v) => !v);
  };

  const handleRegistrationToggle = async () => {
    if (registrationState.isClosed) return;

    setRegistering(true);
    setRegistrationError(null);
    try {
      const method = schedule.isRegisteredByMe ? "DELETE" : "POST";
      const res = await fetch(
        `/api/leagues/${leagueDbId}/schedules/${schedule.id}/registration`,
        { method },
      );

      if (!res.ok) {
        const data = await readJsonSafely<{ error?: string; message?: string }>(
          res,
        );
        throw new Error(
          data?.message ?? data?.error ?? `registration_failed_${res.status}`,
        );
      }

      onSessionUpdated();
    } catch (err) {
      setRegistrationError(
        err instanceof Error ? err.message : "registration_failed",
      );
    } finally {
      setRegistering(false);
    }
  };

  if (schedule.isOffWeek) {
    return (
      <div className="flex items-center gap-4 px-4 py-3 rounded-xl border border-zinc-800/40 bg-zinc-900/20 opacity-50">
        <div className="shrink-0 w-7 h-7 rounded-md bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-600">
          —
        </div>
        <span className="text-sm text-zinc-500">Off Week</span>
        <span className="text-xs text-zinc-600 ml-auto">
          {fmtDate(schedule.eventDate)}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border transition-colors overflow-hidden ${
        expanded
          ? "border-zinc-600 bg-zinc-900"
          : pastDate && !session?.hasResults
            ? "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 cursor-pointer"
            : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 cursor-pointer"
      }`}
    >
      {/* Clickable header row */}
      <div
        onClick={handleToggle}
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none"
      >
        {/* Race number */}
        <div className="shrink-0 w-7 h-7 rounded-md bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400">
          {raceNumber}
        </div>

        {/* Date */}
        <div className="shrink-0 w-40 hidden sm:block">
          <p className="text-sm font-medium text-white">
            {fmtDate(schedule.eventDate)}
          </p>
          <p className="text-xs text-zinc-500">{fmtTime(schedule.eventDate)}</p>
        </div>

        {/* Race info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white text-sm">
              {schedule.raceName}
            </span>
            {!schedule.pointsCount && (
              <span className="text-xs text-zinc-600 border border-zinc-700/60 px-1.5 py-0.5 rounded">
                No Pts
              </span>
            )}
            {schedule.canDrop && (
              <span className="text-xs text-zinc-600 border border-zinc-700/60 px-1.5 py-0.5 rounded">
                Drop
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 truncate mt-0.5">
            {session?.trackName ?? schedule.trackName ?? "Track TBD"}
            {schedule.raceLength && (
              <span className="text-zinc-600"> · {schedule.raceLength}</span>
            )}
          </p>
          {/* Mobile date */}
          <p className="text-xs text-zinc-600 sm:hidden mt-0.5">
            {fmtDate(schedule.eventDate)}
          </p>
        </div>

        {/* Winner quick-view */}
        {session?.hasResults && session.winnerName && (
          <div className="hidden md:block shrink-0 text-right">
            <p className="text-xs text-zinc-500">🏆 Winner</p>
            <p className="text-sm text-zinc-200 font-medium">
              {session.winnerName}
            </p>
          </div>
        )}

        {/* Status + chevron */}
        <div className="shrink-0 flex items-center gap-2">
          <StatusBadge session={session} eventDate={schedule.eventDate} />
          <svg
            className={`w-4 h-4 text-zinc-500 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t border-zinc-800 px-4 pb-5 pt-4">
          {/* Event metadata row */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm mb-4">
            <div>
              <p className="text-xs text-zinc-500 mb-0.5">Date &amp; Time</p>
              <p className="text-zinc-200">
                {fmtDate(schedule.eventDate)} &middot;{" "}
                {fmtTime(schedule.eventDate)}
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 mb-0.5">Track</p>
              <p className="text-zinc-200">
                {session?.trackName ?? schedule.trackName ?? "TBD"}
              </p>
            </div>
            {schedule.raceLength && (
              <div>
                <p className="text-xs text-zinc-500 mb-0.5">Race Length</p>
                <p className="text-zinc-200">{schedule.raceLength}</p>
              </div>
            )}
            {session?.subsessionId && (
              <div>
                <p className="text-xs text-zinc-500 mb-0.5">Subsession ID</p>
                <p className="text-zinc-400 font-mono text-xs">
                  {session.subsessionId}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs text-zinc-500 mb-0.5">Registrations</p>
              <p className="text-zinc-200">
                {schedule.registrationEnabled
                  ? `${schedule.registrationCount} driver${schedule.registrationCount !== 1 ? "s" : ""}`
                  : "Disabled"}
              </p>
            </div>
          </div>

          {schedule.registrationEnabled ? (
            <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-zinc-400">
                  {registrationState.message ??
                    (schedule.isRegisteredByMe
                      ? "You are registered for this event."
                      : "Register for this event to confirm participation.")}
                </p>
                <button
                  onClick={handleRegistrationToggle}
                  disabled={registering || registrationState.isClosed}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-60 ${
                    schedule.isRegisteredByMe && !registrationState.isClosed
                      ? "border-zinc-700 text-zinc-300 hover:border-red-500/60 hover:text-red-400"
                      : registrationState.isClosed
                        ? "border-zinc-800 text-zinc-500"
                        : "border-green-700/60 text-green-400 hover:border-green-500"
                  }`}
                >
                  {registrationState.isClosed
                    ? registrationState.buttonLabel
                    : registering
                      ? "Saving..."
                      : schedule.isRegisteredByMe
                        ? "Unregister"
                        : "Register"}
                </button>
              </div>
              {registrationError && (
                <p className="text-xs text-red-400 mt-2">{registrationError}</p>
              )}
            </div>
          ) : (
            <div className="mb-4 rounded-lg border border-dashed border-zinc-800 px-3 py-2 text-xs text-zinc-500">
              Registration is disabled for this event.
            </div>
          )}

          {isAdmin && schedule.registeredMembers.length > 0 && (
            <div className="mb-4 rounded-lg border border-zinc-800 overflow-hidden">
              <div className="px-3 py-2 bg-zinc-800/70 text-xs font-semibold uppercase tracking-widest text-zinc-400">
                Registered Drivers ({schedule.registeredMembers.length})
              </div>
              <div className="divide-y divide-zinc-800">
                {schedule.registeredMembers.map((registration) => (
                  <div
                    key={registration.id}
                    className="px-3 py-2 text-sm flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-zinc-200 truncate">
                        {registration.member.displayName}
                        {registration.member.carNumber
                          ? ` #${registration.member.carNumber}`
                          : ""}
                        {registration.member.nickName
                          ? ` (${registration.member.nickName})`
                          : ""}
                      </p>
                    </div>
                    <Link
                      href={`/app/drivers/${registration.member.custId}?league=${leaguePathId}`}
                      className="text-xs text-zinc-400 hover:text-white transition-colors"
                    >
                      Profile
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          {session ? (
            <>
              {/* Admin toolbar */}
              {isAdmin && (
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
                    Results{" "}
                    {session._count.results > 0 && (
                      <span className="text-zinc-600 normal-case font-normal">
                        ({session._count.results} drivers)
                      </span>
                    )}
                  </p>
                  <button
                    onClick={() => setShowImport((v) => !v)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                  >
                    {showImport ? "Hide Import" : "Import / Update Results"}
                  </button>
                </div>
              )}

              {/* Import panel for admin */}
              {isAdmin && showImport && (
                <AdminImportPanel
                  leagueDbId={leagueDbId}
                  seriesId={seriesId}
                  seasonId={seasonId}
                  raceSessionId={session.id}
                  subsessionId={session.subsessionId}
                  iracingLeagueId={iracingLeagueId}
                  iracingSeasonId={iracingSeasonId}
                  onSuccess={() => {
                    setShowImport(false);
                    fetchResults();
                    onSessionUpdated();
                  }}
                />
              )}

              {/* Results table */}
              {!isAdmin && (
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3">
                  Results
                  {session._count.results > 0 && (
                    <span className="text-zinc-600 normal-case font-normal">
                      {" "}
                      ({session._count.results} drivers)
                    </span>
                  )}
                </p>
              )}

              {loadingResults ? (
                <div className="flex justify-center py-6">
                  <div className="w-5 h-5 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
                </div>
              ) : results && results.length > 0 ? (
                <div className="rounded-xl overflow-hidden border border-zinc-800">
                  {/* Table header */}
                  <div className="grid grid-cols-[2rem_1fr_4rem_3.5rem_4rem_4rem] gap-0 px-3 py-2 bg-zinc-800/80 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                    <span className="text-center">P</span>
                    <span>Driver</span>
                    <span className="text-right">Start</span>
                    <span className="text-right">Laps</span>
                    <span className="text-right">Inc</span>
                    <span className="text-right">Pts</span>
                  </div>
                  {results
                    .sort(
                      (a, b) =>
                        (a.finishPosition ?? 999) - (b.finishPosition ?? 999),
                    )
                    .map((r, idx) => (
                      <div
                        key={r.id}
                        className={`grid grid-cols-[2rem_1fr_4rem_3.5rem_4rem_4rem] gap-0 px-3 py-2.5 text-sm border-t border-zinc-800/60 ${
                          idx === 0
                            ? "bg-yellow-900/10"
                            : "hover:bg-zinc-800/40"
                        }`}
                      >
                        <span className="text-center font-bold text-zinc-400 text-xs">
                          {r.finishPosition ?? "?"}
                        </span>
                        <span className="font-medium text-white truncate flex items-center gap-1.5">
                          <Link
                            href={`/app/drivers/${r.custId}?league=${leaguePathId}`}
                            className="hover:text-red-400 transition-colors"
                          >
                            {r.displayName}
                          </Link>
                          {r.provisional && (
                            <span className="text-[9px] font-bold uppercase border border-yellow-600/50 text-yellow-500 px-1 rounded">
                              P
                            </span>
                          )}
                          {r.notes && (
                            <span
                              title={r.notes}
                              className="text-[9px] text-zinc-500 cursor-help"
                            >
                              ✎
                            </span>
                          )}
                        </span>
                        <span className="text-right text-zinc-500 text-xs">
                          {r.startPosition ?? "—"}
                        </span>
                        <span className="text-right text-zinc-500 text-xs">
                          {r.lapsCompleted ?? "—"}
                        </span>
                        <span className="text-right text-zinc-500 text-xs">
                          {r.incidents ?? "—"}
                        </span>
                        <span
                          className={`text-right text-xs font-semibold ${
                            idx === 0 ? "text-yellow-400" : "text-zinc-300"
                          }`}
                        >
                          {r.finalPoints % 1 === 0
                            ? r.finalPoints
                            : r.finalPoints.toFixed(1)}
                        </span>
                      </div>
                    ))}
                </div>
              ) : session.hasResults ? null : (
                <div className="rounded-xl border border-dashed border-zinc-700 py-8 text-center">
                  <p className="text-zinc-600 text-sm">
                    No results posted yet.
                  </p>
                  {isAdmin && !showImport && (
                    <button
                      onClick={() => setShowImport(true)}
                      className="mt-2 text-red-500 hover:text-red-400 text-sm font-medium"
                    >
                      Import results →
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            /* No session linked */
            <div className="rounded-xl border border-dashed border-zinc-700 py-8 text-center">
              {isAdmin ? (
                <>
                  <p className="text-zinc-500 text-sm mb-3">
                    No iRacing session linked to this event.
                  </p>
                  <p className="text-zinc-600 text-xs">
                    Import results to automatically link a session, or sync
                    seasons from the Admin panel.
                  </p>
                </>
              ) : (
                <p className="text-zinc-600 text-sm">
                  Results not yet available.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { session: authSession, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ leagueId: string }>();

  const [series, setSeries] = useState<Series[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [leagueDbId, setLeagueDbId] = useState("");
  const [iracingLeagueId, setIracingLeagueId] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const requestedSeriesId = searchParams.get("series");

  const triggerReload = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (!authLoading && !authSession?.authenticated) {
      router.replace("/");
    }
  }, [authLoading, authSession, router]);

  // Load is handled by the useEffect below — no separate callback needed

  useEffect(() => {
    if (!authSession?.authenticated) return;
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/leagues/${params.leagueId}/calendar`, {
          cache: "no-store",
        });
        const data =
          (await readJsonSafely<{
            series?: Series[];
            isAdmin?: boolean;
            leagueDbId?: string;
            iracingLeagueId?: number;
            error?: string;
          }>(res)) ?? {};
        if (cancelled) return;
        if (!res.ok)
          throw new Error(
            data?.error ? data.error : `fetch_failed_${res.status}`,
          );
        setSeries(data.series ?? []);
        setIsAdmin(data.isAdmin ?? false);
        setLeagueDbId(data.leagueDbId ?? "");
        setIracingLeagueId(data.iracingLeagueId ?? 0);
        if (data.series && data.series.length > 0) {
          const seriesList = data.series;
          const requestedSeries = requestedSeriesId
            ? seriesList.find((series) => series.id === requestedSeriesId)
            : null;

          setSelectedSeriesId((prev) => {
            if (requestedSeries) return requestedSeries.id;
            if (prev && seriesList.some((series) => series.id === prev)) {
              return prev;
            }
            return seriesList[0].id;
          });
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "unknown_error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [
    authSession?.authenticated,
    params.leagueId,
    reloadToken,
    requestedSeriesId,
  ]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!authSession?.authenticated) return null;

  const activeSeries =
    series.find((s) => s.id === selectedSeriesId) ?? series[0];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800">
        <div className="mx-auto max-w-5xl px-6 h-16 flex items-center justify-between">
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
            {isAdmin && (
              <Link
                href={`/app/${params.leagueId}/admin`}
                className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500"
              >
                Admin Panel
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-black tracking-tight mb-1">
            Schedule & Results
          </h1>
          <p className="text-zinc-400 text-sm">
            Click any race to see details and results.
            {isAdmin && " As an admin, you can also import or update results."}
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-900 bg-red-950/30 p-4 text-red-400 text-sm mb-6">
            {error}
          </div>
        )}

        {series.length === 0 && !error && (
          <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/50 p-16 text-center">
            <div className="text-4xl mb-3">📅</div>
            <h2 className="text-lg font-bold mb-2">No Schedules Yet</h2>
            <p className="text-zinc-500 text-sm">
              Series schedules will appear here once they&apos;ve been
              configured.
            </p>
          </div>
        )}

        {series.length > 0 && (
          <div className="flex gap-6">
            {/* Series sidebar */}
            {series.length > 1 && (
              <div className="w-48 shrink-0">
                <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-3 px-1">
                  Series
                </p>
                <div className="flex flex-col gap-1">
                  {series.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSeriesId(s.id)}
                      className={`text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                        s.id === selectedSeriesId
                          ? "bg-red-600/20 text-red-400 border border-red-800/50"
                          : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Main content */}
            <div className="flex-1 min-w-0">
              {activeSeries && (
                <>
                  <div className="mb-5">
                    <h2 className="text-xl font-bold">{activeSeries.name}</h2>
                    {activeSeries.description && (
                      <p className="text-zinc-400 text-sm mt-1">
                        {activeSeries.description}
                      </p>
                    )}
                  </div>

                  {activeSeries.seasons.length === 0 && (
                    <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 p-10 text-center">
                      <p className="text-zinc-500 text-sm">
                        No active seasons.
                      </p>
                    </div>
                  )}

                  <div className="space-y-8">
                    {activeSeries.seasons.map((season) => {
                      let raceNum = 0;
                      const raceSchedules = season.schedules.filter(
                        (s) => !s.isOffWeek,
                      );
                      const completedRaces = raceSchedules.filter(
                        (s) =>
                          s.importedSession?.hasResults ||
                          new Date(s.eventDate) < new Date(),
                      ).length;

                      return (
                        <div key={season.id}>
                          {/* Season header */}
                          <div className="flex items-end justify-between mb-3">
                            <div>
                              <h3 className="text-base font-semibold">
                                {season.seasonName}
                              </h3>
                              {season.description && (
                                <p className="text-xs text-zinc-500">
                                  {season.description}
                                </p>
                              )}
                            </div>
                            <div className="text-right text-xs text-zinc-500">
                              <p>
                                {completedRaces} / {raceSchedules.length} races
                              </p>
                              {season.numDrops > 0 && (
                                <p className="text-zinc-600">
                                  {season.numDrops} drop
                                  {season.numDrops > 1 ? "s" : ""} allowed
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Progress bar */}
                          {raceSchedules.length > 0 && (
                            <div className="h-1 bg-zinc-800 rounded-full mb-4 overflow-hidden">
                              <div
                                className="h-full bg-red-600 rounded-full transition-all"
                                style={{
                                  width: `${Math.round(
                                    (completedRaces / raceSchedules.length) *
                                      100,
                                  )}%`,
                                }}
                              />
                            </div>
                          )}

                          {season.schedules.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-center">
                              <p className="text-zinc-600 text-sm">
                                No schedule entries yet.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {season.schedules.map((schedule) => {
                                if (!schedule.isOffWeek) raceNum++;
                                return (
                                  <EventCard
                                    key={schedule.id}
                                    schedule={schedule}
                                    raceNumber={raceNum}
                                    leaguePathId={params.leagueId}
                                    isAdmin={isAdmin}
                                    leagueDbId={leagueDbId}
                                    seriesId={activeSeries.id}
                                    seasonId={season.id}
                                    iracingLeagueId={iracingLeagueId}
                                    iracingSeasonId={season.iracingSeasonId}
                                    onSessionUpdated={triggerReload}
                                  />
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
