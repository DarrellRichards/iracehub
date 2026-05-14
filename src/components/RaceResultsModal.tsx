"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface PointsConfig {
  id: string;
  positionPoints: Record<string, number>;
  bonusPoints: Record<string, number>;
  allowProvisionals: boolean;
}

interface ScheduleSummary {
  id: string;
  raceName: string;
  eventDate: string;
  raceOrder: number;
  pointsCount: boolean;
  canDrop: boolean;
  stages: Array<{ stageNumber: number; endLap: number }>;
}

interface Result {
  id: string;
  custId: number;
  displayName: string;
  finishPosition: number | null;
  stageFinishes: number[];
  startPosition: number | null;
  lapsCompleted: number | null;
  incidents: number | null;
  provisional: boolean;
  pointsBase: number;
  pointsAdjustment: number;
  bonusPoints: number;
  penaltyPoints: number;
  finalPoints: number;
  notes: string | null;
}

interface RaceSession {
  id: string;
  iracingSessionId: number;
  subsessionId: number | null;
  hasResults: boolean;
  trackName: string | null;
  launchAt: string;
  schedule: ScheduleSummary | null;
  pointsConfig: PointsConfig | null;
  results: Result[];
  _count: { results: number };
}

interface RaceResultsModalProps {
  leagueId: string;
  seriesId: string;
  season: { id: string; seasonName: string };
  onClose: () => void;
}

type ImportSource = "iracing" | "json" | "csv";

function ImportPanel({
  leagueId,
  seriesId,
  seasonId,
  raceSession,
  onSuccess,
}: {
  leagueId: string;
  seriesId: string;
  seasonId: string;
  raceSession: RaceSession;
  onSuccess: () => void;
}) {
  const [source, setSource] = useState<ImportSource>("iracing");
  const [subsessionId, setSubsessionId] = useState(
    raceSession.subsessionId?.toString() ?? "",
  );
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = async () => {
    setImporting(true);
    setImportError(null);

    const baseUrl = `/api/leagues/${leagueId}/series/${seriesId}/seasons/${seasonId}/sessions/${raceSession.id}/results/import`;

    try {
      if (source === "iracing") {
        const id = parseInt(subsessionId, 10);
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
        alert(`Imported ${d.imported ?? 0} results from iRacing.`);
        onSuccess();
      } else {
        const file = fileInputRef.current?.files?.[0];
        if (!file) {
          setImportError("Please select a file.");
          return;
        }
        const text = await file.text();
        const filename = file.name.toLowerCase();
        let body: object;
        if (filename.endsWith(".csv") || source === "csv") {
          body = { source: "csv", csvContent: text };
        } else {
          body = { source: "json", data: JSON.parse(text) };
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
        alert(`Imported ${d.imported ?? 0} results from file.`);
        onSuccess();
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "import_failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4 mb-4">
      <h4 className="text-sm font-semibold text-zinc-200 mb-3">
        Import Results
      </h4>

      <div className="flex gap-2 mb-4">
        {(["iracing", "json", "csv"] as ImportSource[]).map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
              source === s
                ? "bg-red-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            {s === "iracing"
              ? "iRacing Sync"
              : s === "json"
                ? "JSON File"
                : "CSV File"}
          </button>
        ))}
      </div>

      {source === "iracing" && (
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs text-zinc-400 mb-1">
              Subsession ID
            </label>
            <input
              type="number"
              value={subsessionId}
              onChange={(e) => setSubsessionId(e.target.value)}
              placeholder="e.g. 10127258"
              className="w-full rounded bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
            />
          </div>
        </div>
      )}

      {(source === "json" || source === "csv") && (
        <div>
          <label className="block text-xs text-zinc-400 mb-1">
            {source === "json"
              ? "iRacing Event Result JSON"
              : "iRacing Result CSV"}
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept={source === "json" ? ".json" : ".csv"}
            className="w-full text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-zinc-700 file:text-zinc-200 hover:file:bg-zinc-600"
          />
        </div>
      )}

      {importError && (
        <p className="text-red-400 text-xs mt-2">{importError}</p>
      )}

      <div className="flex justify-end mt-3">
        <button
          onClick={handleImport}
          disabled={importing}
          className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {importing ? "Importing..." : "Import"}
        </button>
      </div>
    </div>
  );
}

function EditableResult({
  result,
  leagueId,
  seriesId,
  seasonId,
  raceSessionId,
  onUpdated,
  onDeleted,
}: {
  result: Result;
  leagueId: string;
  seriesId: string;
  seasonId: string;
  raceSessionId: string;
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    finishPosition: result.finishPosition?.toString() ?? "",
    stageFinishes: (result.stageFinishes ?? []).join(", "),
    startPosition: result.startPosition?.toString() ?? "",
    lapsCompleted: result.lapsCompleted?.toString() ?? "",
    incidents: result.incidents?.toString() ?? "",
    provisional: result.provisional,
    pointsAdjustment: result.pointsAdjustment.toString(),
    bonusPoints: result.bonusPoints.toString(),
    penaltyPoints: result.penaltyPoints.toString(),
    notes: result.notes ?? "",
  });

  const baseUrl = `/api/leagues/${leagueId}/series/${seriesId}/seasons/${seasonId}/sessions/${raceSessionId}/results/${result.id}`;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(baseUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finishPosition: form.finishPosition
            ? parseInt(form.finishPosition, 10)
            : undefined,
          stageFinishes: form.stageFinishes
            .split(",")
            .map((value) => parseInt(value.trim(), 10))
            .filter((value) => Number.isInteger(value) && value > 0),
          startPosition: form.startPosition
            ? parseInt(form.startPosition, 10)
            : undefined,
          lapsCompleted: form.lapsCompleted
            ? parseInt(form.lapsCompleted, 10)
            : undefined,
          incidents: form.incidents ? parseInt(form.incidents, 10) : undefined,
          provisional: form.provisional,
          pointsAdjustment: parseFloat(form.pointsAdjustment) || 0,
          bonusPoints: parseFloat(form.bonusPoints) || 0,
          penaltyPoints: parseFloat(form.penaltyPoints) || 0,
          notes: form.notes || undefined,
        }),
      });
      if (!res.ok) throw new Error("save_failed");
      setEditing(false);
      onUpdated();
    } catch {
      alert("Failed to save result.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Remove ${result.displayName} from this race?`)) return;
    const res = await fetch(baseUrl, { method: "DELETE" });
    if (res.ok) {
      onDeleted();
    } else {
      alert("Failed to delete result.");
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded bg-zinc-800/50 text-sm hover:bg-zinc-800 group">
        <span className="w-6 text-center text-xs font-bold text-zinc-400">
          {result.finishPosition ?? "?"}
        </span>
        <span className="flex-1 font-medium text-white truncate">
          {result.displayName}
          {result.provisional && (
            <span className="ml-1.5 text-[10px] font-semibold uppercase border border-yellow-600/50 text-yellow-500 px-1 rounded">
              P
            </span>
          )}
        </span>
        <span className="text-xs text-zinc-500 w-16 text-right">
          Laps: {result.lapsCompleted ?? "—"}
        </span>
        <span className="text-xs text-zinc-500 w-14 text-right">
          Inc: {result.incidents ?? "—"}
        </span>
        {(result.bonusPoints > 0 || result.penaltyPoints > 0) && (
          <span className="text-xs text-zinc-400 w-20 text-right">
            {result.bonusPoints > 0 && (
              <span className="text-green-400">
                +{result.bonusPoints.toFixed(1)}
              </span>
            )}
            {result.penaltyPoints > 0 && (
              <span className="text-red-400">
                {" "}
                -{result.penaltyPoints.toFixed(1)}
              </span>
            )}
          </span>
        )}
        <span className="text-xs text-zinc-300 w-16 text-right font-medium">
          {result.finalPoints.toFixed(1)} pts
        </span>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setEditing(true)}
            className="text-zinc-400 hover:text-white text-xs px-1.5 py-0.5 rounded border border-zinc-700 hover:border-zinc-500"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            className="text-zinc-400 hover:text-red-400 text-xs px-1.5 py-0.5 rounded border border-zinc-700 hover:border-red-800"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-600 bg-zinc-800 p-3 mb-1">
      <p className="text-sm font-semibold text-white mb-3">
        Editing: {result.displayName}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Finish Pos</label>
          <input
            type="number"
            min={1}
            value={form.finishPosition}
            onChange={(e) =>
              setForm({ ...form, finishPosition: e.target.value })
            }
            className="w-full rounded bg-zinc-900 border border-zinc-600 px-2 py-1.5 text-sm text-white focus:outline-none focus:border-red-500"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Start Pos</label>
          <input
            type="number"
            min={1}
            value={form.startPosition}
            onChange={(e) =>
              setForm({ ...form, startPosition: e.target.value })
            }
            className="w-full rounded bg-zinc-900 border border-zinc-600 px-2 py-1.5 text-sm text-white focus:outline-none focus:border-red-500"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Laps</label>
          <input
            type="number"
            min={0}
            value={form.lapsCompleted}
            onChange={(e) =>
              setForm({ ...form, lapsCompleted: e.target.value })
            }
            className="w-full rounded bg-zinc-900 border border-zinc-600 px-2 py-1.5 text-sm text-white focus:outline-none focus:border-red-500"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Incidents</label>
          <input
            type="number"
            min={0}
            value={form.incidents}
            onChange={(e) => setForm({ ...form, incidents: e.target.value })}
            className="w-full rounded bg-zinc-900 border border-zinc-600 px-2 py-1.5 text-sm text-white focus:outline-none focus:border-red-500"
          />
        </div>
      </div>
      <div className="mb-3">
        <label className="block text-xs text-zinc-400 mb-1">
          Stage Finishes
        </label>
        <input
          type="text"
          value={form.stageFinishes}
          onChange={(e) => setForm({ ...form, stageFinishes: e.target.value })}
          placeholder="Comma separated, e.g. 3, 1, 6"
          className="w-full rounded bg-zinc-900 border border-zinc-600 px-2 py-1.5 text-sm text-white focus:outline-none focus:border-red-500"
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">
            Points Adjustment
          </label>
          <input
            type="number"
            step="0.5"
            value={form.pointsAdjustment}
            onChange={(e) =>
              setForm({ ...form, pointsAdjustment: e.target.value })
            }
            className="w-full rounded bg-zinc-900 border border-zinc-600 px-2 py-1.5 text-sm text-white focus:outline-none focus:border-red-500"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">
            Bonus Points
          </label>
          <input
            type="number"
            step="0.5"
            value={form.bonusPoints}
            onChange={(e) => setForm({ ...form, bonusPoints: e.target.value })}
            className="w-full rounded bg-zinc-900 border border-zinc-600 px-2 py-1.5 text-sm text-white focus:outline-none focus:border-green-500"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">
            Penalty Points
          </label>
          <input
            type="number"
            step="0.5"
            value={form.penaltyPoints}
            onChange={(e) =>
              setForm({ ...form, penaltyPoints: e.target.value })
            }
            className="w-full rounded bg-zinc-900 border border-zinc-600 px-2 py-1.5 text-sm text-white focus:outline-none focus:border-red-500"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Notes</label>
          <input
            type="text"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Optional admin note"
            className="w-full rounded bg-zinc-900 border border-zinc-600 px-2 py-1.5 text-sm text-white focus:outline-none focus:border-red-500"
          />
        </div>
      </div>
      <div className="flex items-center gap-4 mb-3">
        <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
          <input
            type="checkbox"
            checked={form.provisional}
            onChange={(e) =>
              setForm({ ...form, provisional: e.target.checked })
            }
            className="rounded border-zinc-600 accent-red-500"
          />
          Mark as Provisional
        </label>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          onClick={() => setEditing(false)}
          className="px-3 py-1.5 rounded border border-zinc-600 text-zinc-300 hover:text-white text-sm"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

function SessionResultsPanel({
  session,
  leagueId,
  seriesId,
  seasonId,
  onRefresh,
}: {
  session: RaceSession;
  leagueId: string;
  seriesId: string;
  seasonId: string;
  onRefresh: () => void;
}) {
  const [showImport, setShowImport] = useState(false);

  const results = session.results;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      {/* Session header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900">
        <div>
          <p className="font-semibold text-white text-sm">
            {session.schedule?.raceName ??
              session.trackName ??
              `Session #${session.iracingSessionId}`}
          </p>
          <p className="text-xs text-zinc-500 mt-0.5">
            {new Date(
              session.schedule?.eventDate ?? session.launchAt,
            ).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            {session.trackName && ` · ${session.trackName}`}
            {session.subsessionId && (
              <span className="ml-2 text-zinc-600">
                Sub: {session.subsessionId}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {session.hasResults && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-800/50">
              {results.length} results
            </span>
          )}
          <button
            onClick={() => setShowImport((v) => !v)}
            className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
          >
            {showImport ? "Hide Import" : "Import Results"}
          </button>
        </div>
      </div>

      {showImport && (
        <div className="px-4 pt-4">
          <ImportPanel
            leagueId={leagueId}
            seriesId={seriesId}
            seasonId={seasonId}
            raceSession={session}
            onSuccess={() => {
              setShowImport(false);
              onRefresh();
            }}
          />
        </div>
      )}

      {/* Results list */}
      {results.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-zinc-600 text-sm">
            No results yet. Import from iRacing or upload a file.
          </p>
        </div>
      ) : (
        <div className="px-4 py-3 space-y-1">
          {/* Header row */}
          <div className="flex items-center gap-2 px-3 py-1 text-xs text-zinc-600 font-medium uppercase tracking-widest">
            <span className="w-6 text-center">#</span>
            <span className="flex-1">Driver</span>
            <span className="w-16 text-right">Laps</span>
            <span className="w-14 text-right">Inc</span>
            <span className="w-16 text-right">Points</span>
            <span className="w-16" />
          </div>
          {results
            .sort(
              (a, b) => (a.finishPosition ?? 999) - (b.finishPosition ?? 999),
            )
            .map((result) => (
              <EditableResult
                key={result.id}
                result={result}
                leagueId={leagueId}
                seriesId={seriesId}
                seasonId={seasonId}
                raceSessionId={session.id}
                onUpdated={onRefresh}
                onDeleted={() => onRefresh()}
              />
            ))}
        </div>
      )}
    </div>
  );
}

export function RaceResultsModal({
  leagueId,
  seriesId,
  season,
  onClose,
}: RaceResultsModalProps) {
  const [sessions, setSessions] = useState<RaceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => setRefreshToken((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/leagues/${leagueId}/series/${seriesId}/seasons/${season.id}/sessions`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error("failed_to_load_sessions");
        if (!cancelled) setSessions((await res.json()) as RaceSession[]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [leagueId, seriesId, season.id, refreshToken]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-zinc-950 rounded-2xl border border-zinc-800 shadow-2xl mt-8 mb-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-bold text-white">Race Results</h2>
            <p className="text-sm text-zinc-400">{season.seasonName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5">
          {loading && (
            <div className="flex justify-center py-10">
              <div className="h-6 w-6 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-900 bg-red-950/30 p-4 text-red-400 text-sm">
              {error}
            </div>
          )}

          {!loading && !error && sessions.length === 0 && (
            <div className="text-center py-12">
              <div className="text-3xl mb-3">🏁</div>
              <p className="text-zinc-400 text-sm font-medium mb-1">
                No Race Sessions
              </p>
              <p className="text-zinc-600 text-sm">
                Sessions are imported when syncing seasons from iRacing.
              </p>
            </div>
          )}

          {!loading && sessions.length > 0 && (
            <div className="space-y-4">
              {sessions.map((session) => (
                <SessionResultsPanel
                  key={session.id}
                  session={session}
                  leagueId={leagueId}
                  seriesId={seriesId}
                  seasonId={season.id}
                  onRefresh={refresh}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
