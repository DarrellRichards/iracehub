"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import Link from "next/link";

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

export default function AdminWidgetsPage() {
  const { session, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const params = useParams<{ leagueId: string }>();

  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [widgetView, setWidgetView] = useState(
    "all" as "all" | "upcoming" | "results" | "standings" | "schedule",
  );
  const [widgetPreset, setWidgetPreset] = useState(
    "custom" as "custom" | "nascar-red" | "dark-slate" | "light-clean",
  );
  const [widgetTheme, setWidgetTheme] = useState("light" as "light" | "dark");
  const [widgetAccentColor, setWidgetAccentColor] = useState("#ef4444");
  const [widgetBgColor, setWidgetBgColor] = useState("#ffffff");
  const [widgetNoBackground, setWidgetNoBackground] = useState(false);
  const [widgetCompactMode, setWidgetCompactMode] = useState(false);
  const [widgetTextColor, setWidgetTextColor] = useState("#111827");
  const [widgetBorderColor, setWidgetBorderColor] = useState("#e5e7eb");
  const [widgetTargetSelector] = useState("#irh-widget");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [standingsLimitInput, setStandingsLimitInput] = useState(10);
  const [scheduleLimitInput, setScheduleLimitInput] = useState(12);
  const [resultsLimitInput] = useState(20);

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
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "unknown_error");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [session?.authenticated, params.leagueId]);

  const clampInt = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

  const applyWidgetPreset = (
    preset: "custom" | "nascar-red" | "dark-slate" | "light-clean",
  ) => {
    setWidgetPreset(preset);

    if (preset === "nascar-red") {
      setWidgetTheme("dark");
      setWidgetAccentColor("#ef4444");
      setWidgetBgColor("#0a0a0a");
      setWidgetNoBackground(false);
      setWidgetTextColor("#f3f4f6");
      setWidgetBorderColor("#3f3f46");
      return;
    }

    if (preset === "dark-slate") {
      setWidgetTheme("dark");
      setWidgetAccentColor("#38bdf8");
      setWidgetBgColor("#0f172a");
      setWidgetNoBackground(false);
      setWidgetTextColor("#e2e8f0");
      setWidgetBorderColor("#334155");
      return;
    }

    if (preset === "light-clean") {
      setWidgetTheme("light");
      setWidgetAccentColor("#2563eb");
      setWidgetBgColor("#ffffff");
      setWidgetNoBackground(false);
      setWidgetTextColor("#111827");
      setWidgetBorderColor("#e5e7eb");
    }
  };

  const standingsLimit = clampInt(standingsLimitInput, 1, 50);
  const scheduleLimit = clampInt(scheduleLimitInput, 1, 50);
  const resultsLimit = clampInt(resultsLimitInput, 1, 100);

  const widgetOrigin =
    typeof window === "undefined" ? "" : window.location.origin;

  const widgetLeagueId = league ? league.routeLeagueId : "";
  const widgetQueryParams = new URLSearchParams({
    standingsLimit: String(standingsLimit),
    scheduleLimit: String(scheduleLimit),
    resultsLimit: String(resultsLimit),
    view: widgetView,
    theme: widgetTheme,
    accent: widgetAccentColor,
    bg: widgetNoBackground ? "transparent" : widgetBgColor,
    text: widgetTextColor,
    border: widgetBorderColor,
    compact: String(widgetCompactMode),
  });
  const widgetQuery = widgetQueryParams.toString();

  const embedPath = `/api/widgets/leagues/${widgetLeagueId}/embed?${widgetQuery}`;
  const embedUrl = widgetOrigin ? `${widgetOrigin}${embedPath}` : embedPath;

  const getEmbedCodeForView = (
    view: "all" | "upcoming" | "results" | "standings" | "schedule",
  ) => {
    const params = new URLSearchParams(widgetQueryParams);
    params.set("view", view);
    const viewEmbedUrl = widgetOrigin
      ? `${widgetOrigin}/api/widgets/leagues/${widgetLeagueId}/embed?${params.toString()}`
      : `/api/widgets/leagues/${widgetLeagueId}/embed?${params.toString()}`;
    return [
      '<div id="irh-widget"></div>',
      `<script src="${viewEmbedUrl}"${widgetTargetSelector.trim() ? ` data-target="${widgetTargetSelector.trim()}"` : ""}></script>`,
    ].join("\n");
  };

  const previewEmbedUrl = embedUrl
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;");

  const widgetPreviewSrcDoc = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:12px;background:#09090b;">
    <div id="irh-widget-preview"></div>
    <script src="${previewEmbedUrl}" data-target="#irh-widget-preview"><\/script>
  </body>
</html>`;

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(label);
      setTimeout(() => {
        setCopiedField((current) => (current === label ? null : current));
      }, 1800);
    } catch {
      alert("Unable to copy to clipboard.");
    }
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
            <p className="text-xs text-zinc-500 mb-1">Admin Panel / Widgets</p>
            <h1 className="text-lg font-bold">{league?.leagueName}</h1>
          </div>
          <div className="flex items-center gap-3">
            {league && (
              <a
                href={`/app/${league.routeLeagueId}`}
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                ← League View
              </a>
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
          <div>
            <div className="mb-8">
              <h2 className="text-3xl font-bold mb-2">League Widgets</h2>
              <p className="text-zinc-400">
                Generate embeddable widgets to display your league&apos;s schedule,
                standings, and race results on any website.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 space-y-6">
              {/* Widget Configuration */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Widget Settings</h3>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                  <label className="text-xs text-zinc-400 space-y-2">
                    <span className="block font-medium">Style Preset</span>
                    <select
                      value={widgetPreset}
                      onChange={(e) =>
                        applyWidgetPreset(
                          e.target.value as
                            | "custom"
                            | "nascar-red"
                            | "dark-slate"
                            | "light-clean",
                        )
                      }
                      className="w-full rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                    >
                      <option value="custom">Custom</option>
                      <option value="nascar-red">NASCAR Red</option>
                      <option value="dark-slate">Dark Slate</option>
                      <option value="light-clean">Light Clean</option>
                    </select>
                  </label>

                  <label className="text-xs text-zinc-400 space-y-2">
                    <span className="block font-medium">Widget Type</span>
                    <select
                      value={widgetView}
                      onChange={(e) =>
                        setWidgetView(
                          e.target.value as
                            | "all"
                            | "upcoming"
                            | "results"
                            | "standings"
                            | "schedule",
                        )
                      }
                      className="w-full rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                    >
                      <option value="all">All Sections</option>
                      <option value="upcoming">Upcoming Event</option>
                      <option value="results">Latest Race Results</option>
                      <option value="standings">Standings</option>
                      <option value="schedule">Schedule</option>
                    </select>
                  </label>

                  <label className="text-xs text-zinc-400 space-y-2">
                    <span className="block font-medium">Theme</span>
                    <select
                      value={widgetTheme}
                      onChange={(e) => {
                        setWidgetPreset("custom");
                        setWidgetTheme(e.target.value as "light" | "dark");
                      }}
                      className="w-full rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                    >
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </label>

                  <label className="text-xs text-zinc-400 space-y-2">
                    <span className="block font-medium">Standings Limit</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={standingsLimitInput}
                      onChange={(e) =>
                        setStandingsLimitInput(
                          Number.parseInt(e.target.value, 10) || 10,
                        )
                      }
                      className="w-full rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                    />
                  </label>

                  <label className="text-xs text-zinc-400 space-y-2">
                    <span className="block font-medium">Schedule Limit</span>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={scheduleLimitInput}
                      onChange={(e) =>
                        setScheduleLimitInput(
                          Number.parseInt(e.target.value, 10) || 12,
                        )
                      }
                      className="w-full rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                    />
                  </label>
                </div>

                {/* Color Settings */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                  <label className="text-xs text-zinc-400 space-y-2">
                    <span className="block font-medium">Accent Color</span>
                    <input
                      type="color"
                      value={widgetAccentColor}
                      onChange={(e) => {
                        setWidgetPreset("custom");
                        setWidgetAccentColor(e.target.value);
                      }}
                      className="h-10 w-full rounded-lg bg-zinc-950 border border-zinc-700 p-1 cursor-pointer"
                    />
                  </label>

                  <label className="text-xs text-zinc-400 space-y-2">
                    <span className="block font-medium">Background</span>
                    <input
                      type="color"
                      value={widgetBgColor}
                      onChange={(e) => {
                        setWidgetPreset("custom");
                        setWidgetNoBackground(false);
                        setWidgetBgColor(e.target.value);
                      }}
                      disabled={widgetNoBackground}
                      className="h-10 w-full rounded-lg bg-zinc-950 border border-zinc-700 p-1 cursor-pointer disabled:opacity-50"
                    />
                  </label>

                  <label className="text-xs text-zinc-400 space-y-2">
                    <span className="block font-medium">Text Color</span>
                    <input
                      type="color"
                      value={widgetTextColor}
                      onChange={(e) => {
                        setWidgetPreset("custom");
                        setWidgetTextColor(e.target.value);
                      }}
                      className="h-10 w-full rounded-lg bg-zinc-950 border border-zinc-700 p-1 cursor-pointer"
                    />
                  </label>

                  <label className="text-xs text-zinc-400 space-y-2">
                    <span className="block font-medium">Border Color</span>
                    <input
                      type="color"
                      value={widgetBorderColor}
                      onChange={(e) => {
                        setWidgetPreset("custom");
                        setWidgetBorderColor(e.target.value);
                      }}
                      className="h-10 w-full rounded-lg bg-zinc-950 border border-zinc-700 p-1 cursor-pointer"
                    />
                  </label>
                </div>

                {/* Checkboxes */}
                <div className="flex flex-wrap gap-4">
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      checked={widgetNoBackground}
                      onChange={(e) => {
                        setWidgetPreset("custom");
                        setWidgetNoBackground(e.target.checked);
                      }}
                      className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                    />
                    Transparent background
                  </label>

                  <label className="inline-flex items-center gap-2 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      checked={widgetCompactMode}
                      onChange={(e) => setWidgetCompactMode(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                    />
                    Compact table mode
                  </label>
                </div>
              </div>

              {/* Embed Code Section */}
              <div className="border-t border-zinc-800 pt-6 space-y-4">
                <h3 className="text-lg font-semibold">Embed Code</h3>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm font-medium text-zinc-200">
                      Copy & Paste Embed Code
                    </label>
                    <button
                      onClick={() =>
                        copyText("embedCode", getEmbedCodeForView(widgetView))
                      }
                      className="text-xs px-2.5 py-1.5 rounded bg-red-500 hover:bg-red-600 text-white transition-colors"
                    >
                      {copiedField === "embedCode" ? "Copied!" : "Copy Code"}
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={getEmbedCodeForView(widgetView)}
                    rows={4}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 px-3 py-2 text-xs font-mono"
                  />
                </div>

                <div>
                  <p className="mb-3 text-sm font-medium text-zinc-200">
                    Quick Copy: Widget Variants
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        "all",
                        "upcoming",
                        "results",
                        "standings",
                        "schedule",
                      ] as const
                    ).map((view) => (
                      <button
                        key={view}
                        onClick={() =>
                          copyText(`copy-${view}`, getEmbedCodeForView(view))
                        }
                        className="text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                      >
                        {copiedField === `copy-${view}`
                          ? "Copied!"
                          : view.charAt(0).toUpperCase() + view.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div className="border-t border-zinc-800 pt-6">
                <h3 className="text-lg font-semibold mb-4">Preview</h3>
                <div className="rounded-lg border border-zinc-800 bg-black p-2">
                  <iframe
                    title="League widget preview"
                    srcDoc={widgetPreviewSrcDoc}
                    className="w-full min-h-[540px] rounded border border-zinc-800 bg-zinc-950"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
