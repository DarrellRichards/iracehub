"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";

interface Series {
  id: string;
  name: string;
  isActive: boolean;
}

interface LeagueDetail {
  id: string;
  iracingLeagueId: number | null;
  routeLeagueId: string;
  leagueName: string;
  smallLogo: string | null;
  rosterCount: number | null;
  owner: boolean;
  admin: boolean;
}

interface VirtualMoneySettings {
  id: string;
  virtualModeEnabled: boolean;
  virtualBaselinePayout: number[];
  virtualEntryFee: number;
  virtualStartingMoney: number;
  virtualIncLimit: number;
  virtualCarReplaceCost: number;
  virtualTeamCost: number;
}

interface RecruitingSettingsPayload {
  id: string;
  recruitingOpen: boolean;
  openSeries: Array<{ id: string; name: string }>;
}

const VIRTUAL_PAYOUT_SLOTS = 60;

export default function AdminSettingsPage() {
  const { session, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const params = useParams<{ leagueId: string }>();

  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Virtual Money State
  const [virtualModeEnabled, setVirtualModeEnabled] = useState(false);
  const [virtualEntryFee, setVirtualEntryFee] = useState(0);
  const [virtualStartingMoney, setVirtualStartingMoney] = useState(0);
  const [virtualIncLimit, setVirtualIncLimit] = useState(0);
  const [virtualCarReplaceCost, setVirtualCarReplaceCost] = useState(0);
  const [virtualTeamCost, setVirtualTeamCost] = useState(0);
  const [savingVirtualMoney, setSavingVirtualMoney] = useState(false);
  const [virtualMoneyNotice, setVirtualMoneyNotice] = useState<string | null>(
    null,
  );

  // Recruiting State
  const [recruitingOpen, setRecruitingOpen] = useState(false);
  const [recruitingSeriesIds, setRecruitingSeriesIds] = useState<string[]>([]);
  const [savingRecruiting, setSavingRecruiting] = useState(false);
  const [recruitingNotice, setRecruitingNotice] = useState<string | null>(null);

  // iRacing Link State
  const [pendingIracingLeagueId, setPendingIracingLeagueId] = useState("");
  const [linkingIracingLeague, setLinkingIracingLeague] = useState(false);

  useEffect(() => {
    if (!authLoading && !session?.authenticated) {
      router.replace("/");
    }
  }, [authLoading, session, router]);

  useEffect(() => {
    if (!session?.authenticated) return;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/leagues", { cache: "no-store" });
        const data = (await res.json()) as {
          leagues?: LeagueDetail[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "fetch_failed");

        const found =
          data.leagues?.find(
            (l) =>
              l.id === params.leagueId ||
              l.routeLeagueId === params.leagueId ||
              String(l.iracingLeagueId) === params.leagueId,
          ) ?? null;

        if (!found) {
          setError("League not found or you are not a member.");
        } else if (!found.owner && !found.admin) {
          setError("You do not have admin access to this league.");
        } else {
          setLeague(found);

          // Fetch series and settings
          const [seriesRes, virtualMoneyRes, recruitingRes] = await Promise.all(
            [
              fetch(`/api/leagues/${found.id}/series`, { cache: "no-store" }),
              fetch(`/api/leagues/${found.id}/virtual-money`, {
                cache: "no-store",
              }),
              fetch(`/api/leagues/${found.id}/recruiting`, {
                cache: "no-store",
              }),
            ],
          );

          if (seriesRes.ok) {
            const seriesData = (await seriesRes.json()) as Series[];
            setSeries(seriesData);
          }

          if (virtualMoneyRes.ok) {
            const virtualMoney =
              (await virtualMoneyRes.json()) as VirtualMoneySettings;
            setVirtualModeEnabled(virtualMoney.virtualModeEnabled);
            setVirtualEntryFee(virtualMoney.virtualEntryFee);
            setVirtualStartingMoney(virtualMoney.virtualStartingMoney ?? 0);
            setVirtualIncLimit(virtualMoney.virtualIncLimit);
            setVirtualCarReplaceCost(virtualMoney.virtualCarReplaceCost ?? 0);
            setVirtualTeamCost(virtualMoney.virtualTeamCost);
          }

          if (recruitingRes.ok) {
            const recruitingData =
              (await recruitingRes.json()) as RecruitingSettingsPayload;
            setRecruitingOpen(recruitingData.recruitingOpen ?? false);
            setRecruitingSeriesIds(
              (recruitingData.openSeries ?? []).map((seriesItem) =>
                String(seriesItem.id),
              ),
            );
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "unknown_error");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [session?.authenticated, params.leagueId]);

  const handleSaveVirtualMoney = async () => {
    if (!league) return;

    setSavingVirtualMoney(true);
    setVirtualMoneyNotice(null);

    try {
      const response = await fetch(`/api/leagues/${league.id}/virtual-money`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          virtualModeEnabled,
          virtualEntryFee,
          virtualStartingMoney,
          virtualIncLimit,
          virtualCarReplaceCost,
          virtualTeamCost,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error ?? "failed_to_save");
      }

      setVirtualMoneyNotice("Virtual money settings saved successfully!");
    } catch (err) {
      setVirtualMoneyNotice(
        err instanceof Error ? err.message : "error_saving_virtual_money",
      );
    } finally {
      setSavingVirtualMoney(false);
    }
  };

  const handleSaveRecruiting = async () => {
    if (!league) return;

    setSavingRecruiting(true);
    setRecruitingNotice(null);

    try {
      const response = await fetch(`/api/leagues/${league.id}/recruiting`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recruitingOpen,
          openSeriesIds: recruitingSeriesIds,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error ?? "failed_to_save");
      }

      setRecruitingNotice("Recruiting settings saved successfully!");
    } catch (err) {
      setRecruitingNotice(
        err instanceof Error ? err.message : "failed_to_save_recruiting",
      );
    } finally {
      setSavingRecruiting(false);
    }
  };

  const handleLinkIracingLeague = async () => {
    if (!league) return;

    const parsedLeagueId = Number.parseInt(pendingIracingLeagueId, 10);
    if (!Number.isInteger(parsedLeagueId) || parsedLeagueId <= 0) {
      alert("Enter a valid iRacing league ID.");
      return;
    }

    setLinkingIracingLeague(true);
    try {
      const response = await fetch(`/api/leagues/${league.id}/iracing-link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iracingLeagueId: parsedLeagueId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error ?? "failed_to_link_iracing_league");
      }

      const linkedLeague = (await response.json()) as {
        iracingLeagueId: number | null;
        routeLeagueId: string;
        leagueName: string;
      };

      setLeague((prev) =>
        prev
          ? {
              ...prev,
              iracingLeagueId: linkedLeague.iracingLeagueId,
              routeLeagueId: linkedLeague.routeLeagueId,
              leagueName: linkedLeague.leagueName,
            }
          : prev,
      );
      setPendingIracingLeagueId("");
      alert("League linked to iRacing successfully.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "failed_to_link_iracing");
    } finally {
      setLinkingIracingLeague(false);
    }
  };

  const toggleRecruitingSeries = (seriesId: string, checked: boolean) => {
    setRecruitingSeriesIds((prev) => {
      if (checked) {
        if (prev.includes(seriesId)) return prev;
        return [...prev, seriesId];
      }
      return prev.filter((id) => id !== seriesId);
    });
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session?.authenticated) return null;

  if (error && !league) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-4">{error}</p>
          <Link
            href="/dashboard"
            className="text-zinc-400 hover:text-white text-sm"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800">
        <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500 mb-1">Admin Panel / Settings</p>
            <h1 className="text-lg font-bold">{league?.leagueName}</h1>
          </div>
          <div className="flex items-center gap-3">
            {league && (
              <Link
                href={`/app/${league.routeLeagueId}`}
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                ← League View
              </Link>
            )}
            <button
              onClick={logout}
              className="rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors px-4 py-1.5 text-sm font-medium text-zinc-300 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-12">
        {league && (
          <div className="space-y-8">
            {/* iRacing Link Section */}
            {league.iracingLeagueId == null && (
              <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-6">
                <h2 className="text-lg font-bold mb-2">
                  Link to iRacing League
                </h2>
                <p className="text-sm text-zinc-300 mb-4">
                  Connect your league to iRacing to enable member syncing,
                  season syncing, and other iRacing features.
                </p>
                <div className="flex gap-2 items-end">
                  <label className="text-xs text-zinc-400 space-y-2 flex-1">
                    <span className="block">iRacing League ID</span>
                    <input
                      type="number"
                      min="1"
                      value={pendingIracingLeagueId}
                      onChange={(e) =>
                        setPendingIracingLeagueId(e.target.value)
                      }
                      placeholder="Enter iRacing League ID"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-red-500"
                    />
                  </label>
                  <button
                    onClick={() => void handleLinkIracingLeague()}
                    disabled={linkingIracingLeague}
                    className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {linkingIracingLeague ? "Linking…" : "Link League"}
                  </button>
                </div>
              </div>
            )}

            {/* Recruiting Settings */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <div className="mb-6">
                <h2 className="text-xl font-bold mb-2">Recruiting Settings</h2>
                <p className="text-sm text-zinc-400">
                  Control whether drivers can request to join your league and
                  which series they can join.
                </p>
              </div>

              <label className="mb-6 flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-sm text-zinc-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={recruitingOpen}
                  onChange={(event) => setRecruitingOpen(event.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-red-500 focus:ring-red-500 cursor-pointer"
                />
                <span>League is open to recruiting</span>
              </label>

              {recruitingOpen && (
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                    Series Open to Recruiting
                  </p>
                  {series.filter((s) => s.isActive).length === 0 ? (
                    <p className="text-sm text-zinc-500 mb-4">
                      Create at least one active series to enable recruiting.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                      {series
                        .filter((s) => s.isActive)
                        .map((seriesItem) => (
                          <label
                            key={seriesItem.id}
                            className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-sm text-zinc-200 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={recruitingSeriesIds.includes(
                                seriesItem.id,
                              )}
                              onChange={(event) =>
                                toggleRecruitingSeries(
                                  seriesItem.id,
                                  event.target.checked,
                                )
                              }
                              className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-red-500 focus:ring-red-500 cursor-pointer"
                            />
                            {seriesItem.name}
                          </label>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {recruitingNotice && (
                <p className="mt-4 p-3 rounded bg-green-500/10 border border-green-500/30 text-sm text-green-400">
                  {recruitingNotice}
                </p>
              )}

              <button
                onClick={() => void handleSaveRecruiting()}
                disabled={savingRecruiting}
                className="mt-6 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingRecruiting ? "Saving…" : "Save Recruiting Settings"}
              </button>
            </div>

            {/* Virtual Money Settings */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <div className="mb-6">
                <h2 className="text-xl font-bold mb-2">
                  Virtual Money Settings
                </h2>
                <p className="text-sm text-zinc-400">
                  Configure league-level economy settings. Event-specific purses
                  and payout splits are set during schedule creation.
                </p>
              </div>

              <label className="mb-6 flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-sm text-zinc-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={virtualModeEnabled}
                  onChange={(e) => setVirtualModeEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-red-500 focus:ring-red-500 cursor-pointer"
                />
                <span>Enable Virtual Money Mode</span>
              </label>

              {virtualModeEnabled && (
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="text-xs text-zinc-400 space-y-2">
                      <span className="block font-medium">
                        Entry Fee Per Driver ($)
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={virtualEntryFee}
                        onChange={(e) =>
                          setVirtualEntryFee(
                            Math.max(
                              0,
                              Number.parseInt(e.target.value, 10) || 0,
                            ),
                          )
                        }
                        className="w-full rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                      />
                    </label>

                    <label className="text-xs text-zinc-400 space-y-2">
                      <span className="block font-medium">
                        Starting Balance Per Driver ($)
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={virtualStartingMoney}
                        onChange={(e) =>
                          setVirtualStartingMoney(
                            Math.max(
                              0,
                              Number.parseInt(e.target.value, 10) || 0,
                            ),
                          )
                        }
                        className="w-full rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                      />
                    </label>

                    <label className="text-xs text-zinc-400 space-y-2">
                      <span className="block font-medium">
                        INC Limit Before Car Replacement
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={virtualIncLimit}
                        onChange={(e) =>
                          setVirtualIncLimit(
                            Math.max(
                              0,
                              Number.parseInt(e.target.value, 10) || 0,
                            ),
                          )
                        }
                        className="w-full rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                      />
                    </label>

                    <label className="text-xs text-zinc-400 space-y-2">
                      <span className="block font-medium">
                        Car Replacement Cost ($)
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={virtualCarReplaceCost}
                        onChange={(e) =>
                          setVirtualCarReplaceCost(
                            Math.max(
                              0,
                              Number.parseInt(e.target.value, 10) || 0,
                            ),
                          )
                        }
                        className="w-full rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                      />
                    </label>

                    <label className="text-xs text-zinc-400 space-y-2">
                      <span className="block font-medium">
                        Team Ownership Cost ($)
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={virtualTeamCost}
                        onChange={(e) =>
                          setVirtualTeamCost(
                            Math.max(
                              0,
                              Number.parseInt(e.target.value, 10) || 0,
                            ),
                          )
                        }
                        className="w-full rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                      />
                    </label>
                  </div>

                  <div className="mt-4 p-3 rounded-lg border border-zinc-800 bg-zinc-950/50 text-xs text-zinc-400">
                    <p className="font-medium mb-1">Note:</p>
                    <p>
                      Race purses and payout splits are configured per event in
                      the schedule. These settings define the baseline league
                      economy.
                    </p>
                  </div>
                </div>
              )}

              {virtualMoneyNotice && (
                <p className="mt-4 p-3 rounded bg-green-500/10 border border-green-500/30 text-sm text-green-400">
                  {virtualMoneyNotice}
                </p>
              )}

              <button
                onClick={handleSaveVirtualMoney}
                disabled={savingVirtualMoney}
                className="mt-6 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingVirtualMoney ? "Saving…" : "Save Virtual Money Settings"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
