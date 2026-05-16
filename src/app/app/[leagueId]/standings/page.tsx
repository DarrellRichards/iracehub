"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { DriverSearchBar } from "@/components/DriverSearchBar";
import { useEffect, useState } from "react";

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

interface SeriesSeasonStanding {
  seriesId: string;
  seriesName: string;
  seasonId: string;
  seasonName: string;
  standings: StandingEntry[];
}

interface StandingsResponse {
  league: {
    id: string;
    iracingLeagueId: number;
    leagueName: string;
  };
  overall: StandingEntry[];
  bySeriesSeason: SeriesSeasonStanding[];
}

function StandingTable({
  rows,
  leagueId,
}: {
  rows: StandingEntry[];
  leagueId: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-zinc-500 py-4 text-center">
        No point-scoring results yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900/80 text-zinc-500 text-xs uppercase tracking-widest">
          <tr>
            <th className="text-left px-3 py-2">Pos</th>
            <th className="text-left px-3 py-2">Driver</th>
            <th className="text-right px-3 py-2">Points</th>
            <th className="text-right px-3 py-2">Back</th>
            <th className="text-right px-3 py-2">Starts</th>
            <th className="text-right px-3 py-2">Wins</th>
            <th className="text-right px-3 py-2">Top 5</th>
            <th className="text-right px-3 py-2">Avg Fin</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.custId}
              className={`border-t border-zinc-800 ${index === 0 ? "bg-yellow-900/10" : "hover:bg-zinc-900/30"}`}
            >
              <td className="px-3 py-2 font-semibold text-zinc-300">
                #{index + 1}
              </td>
              <td className="px-3 py-2">
                <Link
                  href={`/app/drivers/${row.custId}?league=${leagueId}`}
                  className="font-medium text-white hover:text-red-400 transition-colors"
                >
                  {row.displayName}
                </Link>
                <span className="ml-2 text-xs text-zinc-600">
                  #{row.custId}
                </span>
              </td>
              <td className="px-3 py-2 text-right font-semibold text-zinc-100">
                {row.points % 1 === 0 ? row.points : row.points.toFixed(1)}
              </td>
              <td className="px-3 py-2 text-right text-zinc-400">
                {index === 0
                  ? "Leader"
                  : row.gapToLeader % 1 === 0
                    ? `-${row.gapToLeader}`
                    : `-${row.gapToLeader.toFixed(1)}`}
              </td>
              <td className="px-3 py-2 text-right text-zinc-400">
                {row.starts}
              </td>
              <td className="px-3 py-2 text-right text-zinc-400">{row.wins}</td>
              <td className="px-3 py-2 text-right text-zinc-400">{row.top5}</td>
              <td className="px-3 py-2 text-right text-zinc-400">
                {row.avgFinish == null ? "—" : row.avgFinish}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LeagueStandingsPage() {
  const params = useParams<{ leagueId: string }>();

  const [data, setData] = useState<StandingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openSeriesIds, setOpenSeriesIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/leagues/${params.leagueId}/standings`, {
          cache: "no-store",
        });
        const payload = (await res.json()) as StandingsResponse & {
          error?: string;
        };

        if (!res.ok) throw new Error(payload.error ?? "fetch_failed");
        if (!cancelled) {
          setData(payload);
          const firstSeriesId = payload.bySeriesSeason[0]?.seriesId;
          setOpenSeriesIds((prev) =>
            prev.length > 0 || !firstSeriesId ? prev : [firstSeriesId],
          );
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
  }, [params.leagueId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const bySeries = (data?.bySeriesSeason ?? []).reduce<
    Record<
      string,
      {
        seriesId: string;
        seriesName: string;
        seasons: Array<{
          seasonId: string;
          seasonName: string;
          standings: StandingEntry[];
        }>;
      }
    >
  >((acc, item) => {
    if (!acc[item.seriesId]) {
      acc[item.seriesId] = {
        seriesId: item.seriesId,
        seriesName: item.seriesName,
        seasons: [],
      };
    }

    acc[item.seriesId].seasons.push({
      seasonId: item.seasonId,
      seasonName: item.seasonName,
      standings: item.standings,
    });

    return acc;
  }, {});

  const seriesBlocks = Object.values(bySeries).sort((a, b) =>
    a.seriesName.localeCompare(b.seriesName),
  );

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
            <Link
              href={`/app/${params.leagueId}`}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              ← League
            </Link>
            <Link
              href={`/app/${params.leagueId}/calendar`}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Calendar
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
            <div>
              <h1 className="text-3xl font-black tracking-tight">
                {data.league.leagueName}
              </h1>
              <p className="text-zinc-500 text-sm mt-1">
                Championship standings by series.
              </p>
            </div>

            <section className="space-y-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Series Standings</h2>
                {seriesBlocks.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setOpenSeriesIds(seriesBlocks.map((s) => s.seriesId))
                      }
                      className="text-xs px-2.5 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                    >
                      Expand all
                    </button>
                    <button
                      onClick={() => setOpenSeriesIds([])}
                      className="text-xs px-2.5 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                    >
                      Collapse all
                    </button>
                  </div>
                )}
              </div>
              {seriesBlocks.length === 0 ? (
                <p className="text-sm text-zinc-500">No points data yet.</p>
              ) : (
                seriesBlocks.map((series) => (
                  <div
                    key={series.seriesId}
                    className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden"
                  >
                    <button
                      onClick={() =>
                        setOpenSeriesIds((prev) =>
                          prev.includes(series.seriesId)
                            ? prev.filter((id) => id !== series.seriesId)
                            : [...prev, series.seriesId],
                        )
                      }
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/30 transition-colors"
                    >
                      <span className="font-semibold text-white text-left">
                        {series.seriesName}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {series.seasons.length} season
                        {series.seasons.length === 1 ? "" : "s"}
                      </span>
                    </button>

                    {openSeriesIds.includes(series.seriesId) && (
                      <div className="border-t border-zinc-800 p-4 space-y-5">
                        {series.seasons.map((season) => (
                          <div key={season.seasonId}>
                            <p className="text-xs text-zinc-500 mb-3">
                              {season.seasonName}
                            </p>
                            <StandingTable
                              rows={season.standings}
                              leagueId={params.leagueId}
                            />
                          </div>
                        ))}
                      </div>
                    )}
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
