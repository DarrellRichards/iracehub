"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RaceSessionSummary {
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
}

export interface AdminSchedule {
  id: string;
  seasonId: string;
  seriesId: string;
  eventDate: string;
  raceName: string;
  isOffWeek: boolean;
  pointsCount: boolean;
  canDrop: boolean;
  registrationEnabled: boolean;
  trackName?: string | null;
  trackId?: number | null;
  raceLength?: string | null;
  stages?: Array<{ stageNumber: number; endLap: number }>;
  raceOrder: number;
  importedSession: RaceSessionSummary | null;
  registrations?: Array<{
    id: string;
    member: {
      id: string;
      custId: number;
      displayName: string;
      carNumber: string | null;
      nickName: string | null;
    };
  }>;
  _count?: {
    registrations?: number;
  };
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

type ImportTab = "iracing" | "file";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-900/40 text-green-400 border border-green-800/50">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
        Results Posted
      </span>
    );
  }
  if (session) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-yellow-900/40 text-yellow-400 border border-yellow-800/50">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
        Pending Results
      </span>
    );
  }
  if (date < now) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-700/40 text-zinc-400 border border-zinc-600/50">
        Completed
      </span>
    );
  }
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / 864e5);
  if (diffDays <= 7) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-900/40 text-red-400 border border-red-800/50">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
        {diffDays === 1 ? "Tomorrow" : `In ${diffDays} days`}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-900/40 text-blue-400 border border-blue-800/50">
      Upcoming
    </span>
  );
}

// ─── Import Panel ─────────────────────────────────────────────────────────────

function ImportPanel({
  leagueId,
  seriesId,
  seasonId,
  raceSessionId,
  subsessionId,
  iracingLeagueId,
  iracingSeasonId,
  onSuccess,
}: {
  leagueId: string;
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

  const baseUrl = `/api/leagues/${leagueId}/series/${seriesId}/seasons/${seasonId}/sessions/${raceSessionId}/results/import`;

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
        let body: unknown;
        if (isJson) {
          if (!text.trim()) {
            throw new Error("Selected JSON file is empty.");
          }
          body = { source: "json", data: JSON.parse(text) };
        } else {
          body = { source: "csv", csvContent: text };
        }
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
    <div className="mt-3 rounded-xl border border-zinc-700 bg-zinc-900/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-3">
        Import / Update Results
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
                <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
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
              Not linked to an iRacing season — enter a subsession ID manually.
            </p>
          )}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">
              Subsession ID{" "}
              <span className="text-zinc-600">(or enter manually)</span>
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
          className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:bg-red-600/50 text-white text-xs font-semibold transition-colors"
        >
          {importing ? "Importing..." : "Import Results"}
        </button>
      </div>
    </div>
  );
}

// ─── Schedule Event Row ───────────────────────────────────────────────────────

function ScheduleEventRow({
  schedule,
  leagueId,
  iracingLeagueId,
  seriesId,
  seasonId,
  iracingSeasonId,
  onEdit,
  onDelete,
  onRefresh,
}: {
  schedule: AdminSchedule;
  leagueId: string;
  iracingLeagueId: number;
  seriesId: string;
  seasonId: string;
  iracingSeasonId: number | null;
  onEdit: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [raceSessionId, setRaceSessionId] = useState(
    schedule.importedSession?.id ?? null,
  );
  const [creatingSession, setCreatingSession] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const session = schedule.importedSession;

  const fetchResults = useCallback(
    async (sessionId: string) => {
      setLoadingResults(true);
      try {
        const res = await fetch(
          `/api/leagues/${leagueId}/series/${seriesId}/seasons/${seasonId}/sessions/${sessionId}/results`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { results?: Result[] };
        setResults(data.results ?? []);
      } catch {
        // ignore
      } finally {
        setLoadingResults(false);
      }
    },
    [leagueId, seriesId, seasonId],
  );

  const handleExpand = useCallback(async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && raceSessionId && results === null) {
      await fetchResults(raceSessionId);
    }
  }, [expanded, raceSessionId, results, fetchResults]);

  const handleShowImport = async () => {
    if (!raceSessionId) {
      // Create a placeholder session first
      setCreatingSession(true);
      try {
        const res = await fetch(
          `/api/leagues/${leagueId}/series/${seriesId}/seasons/${seasonId}/sessions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scheduleId: schedule.id }),
          },
        );
        if (!res.ok) throw new Error("failed to create session");
        const data = (await res.json()) as { id: string };
        setRaceSessionId(data.id);
      } catch (err) {
        alert(err instanceof Error ? err.message : "error creating session");
        return;
      } finally {
        setCreatingSession(false);
      }
    }
    setShowImport((prev) => !prev);
    if (!expanded) setExpanded(true);
  };

  const handleImportSuccess = async () => {
    setShowImport(false);
    if (raceSessionId) {
      await fetchResults(raceSessionId);
    }
    onRefresh();
  };

  const handleRecalculatePoints = async () => {
    if (!raceSessionId) return;

    setRecalculating(true);
    try {
      const res = await fetch(
        `/api/leagues/${leagueId}/series/${seriesId}/seasons/${seasonId}/sessions/${raceSessionId}/results/recalculate`,
        { method: "POST" },
      );

      if (!res.ok) {
        const d = (await res.json()) as { error?: string; message?: string };
        throw new Error(d.message ?? d.error ?? "recalculate_failed");
      }

      const d = (await res.json()) as {
        updated?: number;
        pointsCountApplied?: boolean;
      };

      await fetchResults(raceSessionId);
      onRefresh();
      alert(
        `Recalculated ${d.updated ?? 0} result${(d.updated ?? 0) === 1 ? "" : "s"}${d.pointsCountApplied === false ? " (points disabled for this event)" : ""}.`,
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "recalculate_failed");
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-zinc-900/40 transition-colors"
        onClick={handleExpand}
      >
        {/* Expand chevron */}
        <span
          className={`text-zinc-500 text-xs transition-transform ${expanded ? "rotate-90" : ""}`}
        >
          ▶
        </span>

        {/* Race number */}
        <span className="text-xs font-mono text-zinc-500 w-5 text-center flex-shrink-0">
          {schedule.isOffWeek ? "—" : schedule.raceOrder}
        </span>

        {/* Name + track */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-sm font-medium ${schedule.isOffWeek ? "text-zinc-500 italic" : "text-white"}`}
            >
              {schedule.isOffWeek ? "Off Week" : schedule.raceName}
            </span>
            {!schedule.isOffWeek && schedule.trackName && (
              <span className="text-xs text-zinc-500">
                {schedule.trackName}
              </span>
            )}
          </div>
          <div className="text-xs text-zinc-600 mt-0.5">
            {fmtDate(schedule.eventDate)}
          </div>
        </div>

        {/* Status badge */}
        <StatusBadge session={session} eventDate={schedule.eventDate} />

        {schedule.registrationEnabled && (
          <span className="text-xs text-zinc-500">
            {schedule._count?.registrations ??
              schedule.registrations?.length ??
              0}{" "}
            reg
          </span>
        )}

        {/* Result count pill */}
        {session && session._count.results > 0 && (
          <span className="text-xs text-zinc-500">
            {session._count.results} drivers
          </span>
        )}

        {/* Action buttons (stop propagation so row clicks don't toggle expand) */}
        <div
          className="flex items-center gap-1 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleRecalculatePoints}
            disabled={!raceSessionId || recalculating || schedule.isOffWeek}
            title="Recalculate points for all current results"
            className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:border-emerald-500/50 hover:text-emerald-400 disabled:opacity-40 transition-colors"
          >
            {recalculating ? "…" : "Recalc"}
          </button>
          <button
            onClick={handleShowImport}
            disabled={creatingSession || schedule.isOffWeek}
            title="Import / update results"
            className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:border-blue-500/50 hover:text-blue-400 disabled:opacity-40 transition-colors"
          >
            {creatingSession ? "…" : "Results"}
          </button>
          <button
            onClick={onEdit}
            title="Edit schedule entry"
            className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            title="Delete schedule entry"
            className="text-[11px] px-2 py-1 rounded border border-zinc-700 text-zinc-400 hover:border-red-500/50 hover:text-red-400 transition-colors"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && !schedule.isOffWeek && (
        <div className="border-t border-zinc-800/50 px-3 pb-3 pt-3">
          <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
            <p className="text-xs text-zinc-400">
              Registration:{" "}
              {schedule.registrationEnabled ? "Enabled" : "Disabled"}
              {schedule.registrationEnabled && (
                <span className="ml-2 text-zinc-500">
                  (
                  {schedule._count?.registrations ??
                    schedule.registrations?.length ??
                    0}{" "}
                  registered)
                </span>
              )}
            </p>
            {(schedule.stages?.length ?? 0) > 0 && (
              <p className="text-xs text-zinc-500 mt-1">
                Stages:{" "}
                {(schedule.stages ?? [])
                  .map((stage) => `S${stage.stageNumber} @ Lap ${stage.endLap}`)
                  .join(" · ")}
              </p>
            )}
          </div>

          {schedule.registrationEnabled &&
            (schedule.registrations?.length ?? 0) > 0 && (
              <div className="mb-3 rounded-lg border border-zinc-800 overflow-hidden">
                <div className="px-3 py-2 bg-zinc-800/70 text-xs font-semibold uppercase tracking-widest text-zinc-400">
                  Registered Drivers ({schedule.registrations?.length ?? 0})
                </div>
                <div className="divide-y divide-zinc-800">
                  {(schedule.registrations ?? []).map((registration) => (
                    <div
                      key={registration.id}
                      className="px-3 py-2 text-sm flex items-center justify-between gap-2"
                    >
                      <span className="text-zinc-200 truncate">
                        {registration.member.displayName}
                        {registration.member.carNumber
                          ? ` #${registration.member.carNumber}`
                          : ""}
                        {registration.member.nickName
                          ? ` (${registration.member.nickName})`
                          : ""}
                      </span>
                      <Link
                        href={`/app/drivers/${registration.member.custId}?league=${iracingLeagueId}`}
                        className="text-xs text-zinc-400 hover:text-white transition-colors"
                      >
                        Profile
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Import panel */}
          {showImport && raceSessionId && (
            <ImportPanel
              leagueId={leagueId}
              seriesId={seriesId}
              seasonId={seasonId}
              raceSessionId={raceSessionId}
              subsessionId={session?.subsessionId ?? null}
              iracingLeagueId={iracingLeagueId}
              iracingSeasonId={iracingSeasonId}
              onSuccess={handleImportSuccess}
            />
          )}

          {/* Results table */}
          {!showImport && (
            <>
              {loadingResults ? (
                <div className="flex items-center justify-center py-6">
                  <div className="h-5 w-5 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
                </div>
              ) : results && results.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-zinc-500 border-b border-zinc-800">
                        <th className="text-left py-1.5 pr-3 font-medium">
                          Pos
                        </th>
                        <th className="text-left py-1.5 pr-3 font-medium">
                          Driver
                        </th>
                        <th className="text-center py-1.5 pr-3 font-medium">
                          Start
                        </th>
                        <th className="text-center py-1.5 pr-3 font-medium">
                          Laps
                        </th>
                        <th className="text-center py-1.5 pr-3 font-medium">
                          Inc
                        </th>
                        <th className="text-right py-1.5 font-medium">Pts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/40">
                      {results.map((r) => (
                        <tr
                          key={r.id}
                          className={`${r.finishPosition === 1 ? "bg-yellow-500/5" : ""}`}
                        >
                          <td className="py-1.5 pr-3 font-mono text-zinc-300">
                            {r.finishPosition ?? "—"}
                            {r.provisional && (
                              <span className="ml-1 text-[9px] text-yellow-500 font-semibold">
                                P
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-zinc-200">
                            <Link
                              href={`/app/drivers/${r.custId}?league=${iracingLeagueId}`}
                              className="hover:text-red-400 transition-colors"
                            >
                              {r.displayName}
                            </Link>
                          </td>
                          <td className="py-1.5 pr-3 text-center text-zinc-400">
                            {r.startPosition ?? "—"}
                          </td>
                          <td className="py-1.5 pr-3 text-center text-zinc-400">
                            {r.lapsCompleted ?? "—"}
                          </td>
                          <td className="py-1.5 pr-3 text-center text-zinc-400">
                            {r.incidents ?? "—"}
                          </td>
                          <td className="py-1.5 text-right font-semibold text-white">
                            {r.finalPoints}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : session ? (
                <p className="text-xs text-zinc-500 py-3 text-center">
                  No results yet.{" "}
                  <button
                    onClick={() => setShowImport(true)}
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Import now
                  </button>
                </p>
              ) : (
                <p className="text-xs text-zinc-500 py-3 text-center">
                  No results imported yet.{" "}
                  <button
                    onClick={handleShowImport}
                    className="text-blue-400 hover:text-blue-300 underline"
                  >
                    Import results
                  </button>
                </p>
              )}
            </>
          )}

          {/* Toggle back to results */}
          {showImport && (
            <button
              onClick={() => setShowImport(false)}
              className="mt-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              ← back to results
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AdminScheduleSection ─────────────────────────────────────────────────────

interface AdminScheduleSectionProps {
  leagueId: string;
  iracingLeagueId: number;
  seriesId: string;
  season: { id: string; seasonName: string; iracingSeasonId: number | null };
  schedules: AdminSchedule[];
  onAddSchedule: () => void;
  onEditSchedule: (schedule: AdminSchedule) => void;
  onDeleteSchedule: (schedule: AdminSchedule) => void;
  onRefresh: () => void;
}

export function AdminScheduleSection({
  leagueId,
  iracingLeagueId,
  seriesId,
  season,
  schedules,
  onAddSchedule,
  onEditSchedule,
  onDeleteSchedule,
  onRefresh,
}: AdminScheduleSectionProps) {
  const sorted = [...schedules].sort((a, b) => a.raceOrder - b.raceOrder);

  return (
    <div className="mt-3 pt-3 border-t border-zinc-800/50">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-zinc-400">
          Schedule ({schedules.length}{" "}
          {schedules.length === 1 ? "event" : "events"})
        </p>
        <button
          onClick={onAddSchedule}
          className="text-xs px-2.5 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-red-500/50 hover:text-red-400 transition-colors"
        >
          + Add Race
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-zinc-600 italic py-2">
          No races added yet.{" "}
          <button
            onClick={onAddSchedule}
            className="text-zinc-400 hover:text-zinc-200 underline"
          >
            Add the first one
          </button>
        </p>
      ) : (
        <div className="space-y-1">
          {sorted.map((schedule) => (
            <ScheduleEventRow
              key={schedule.id}
              schedule={schedule}
              leagueId={leagueId}
              iracingLeagueId={iracingLeagueId}
              seriesId={seriesId}
              seasonId={season.id}
              iracingSeasonId={season.iracingSeasonId}
              onEdit={() => onEditSchedule(schedule)}
              onDelete={() => onDeleteSchedule(schedule)}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}
