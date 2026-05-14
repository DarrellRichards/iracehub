"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { AddScheduleModal } from "@/components/AddScheduleModal";
import {
  AdminScheduleSection,
  AdminSchedule,
} from "@/components/AdminScheduleSection";

interface LeagueDetail {
  id: string;
  iracingLeagueId: number;
  leagueName: string;
  smallLogo: string | null;
  rosterCount: number | null;
  owner: boolean;
  admin: boolean;
}

interface PointsSystem {
  id: string;
  name: string;
  description: string | null;
  positionPoints: Record<string, number>;
  bonusPoints: Record<string, number>;
  isDefault: boolean;
  isPreset: boolean;
  presetType: string | null;
  leagueId: string | null;
}

interface Series {
  id: string;
  name: string;
  description: string | null;
  cars: string[];
  isActive: boolean;
  pointsSystem: PointsSystem;
  createdAt: string;
  updatedAt: string;
}

interface Season {
  id: string;
  seriesId: string;
  iracingSeasonId: number | null;
  seasonName: string;
  description: string | null;
  cars: Array<{ car_id: number; car_name: string }>;
  isActive: boolean;
  hidden: boolean;
  numDrops: number;
  noDropsOnOrAfterRaceNum: number;
  iracingPointsSystemId: number | null;
  iracingPointsSystemName: string | null;
  iracingPointsSystemDesc: string | null;
  isSynced: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Helmet {
  pattern: number;
  color1: string;
  color2: string;
  color3: string;
  face_type: number;
  helmet_type: number;
}

interface Member {
  id: string;
  custId: number;
  displayName: string;
  owner: boolean;
  admin: boolean;
  leagueMailOptOut: boolean | null;
  leaguePmOptOut: boolean | null;
  leagueMemberSince: string;
  carNumber: string | null;
  nickName: string | null;
  helmet: Helmet;
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface EditingSeasonData {
  seriesId: string;
  seasonId: string;
}

interface ScheduleWeather {
  type: "Set" | "Realistic";
  skies?: "Clear" | "Partly Cloudy" | "Mostly Cloudy" | "Overcast";
  temp?: { unit: "F" | "C"; value: number };
  humidity?: number;
  fog?: number;
  windDirection?: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
  windSpeed?: { speed: number; unit: "MPH" | "KPH" };
}

interface Schedule {
  id: string;
  seasonId: string;
  seriesId: string;
  eventDate: string;
  raceName: string;
  isOffWeek: boolean;
  pointsCount: boolean;
  canDrop: boolean;
  registrationEnabled: boolean;
  trackName?: string;
  trackId?: number;
  raceLength?: string;
  stages: Array<{ stageNumber: number; endLap: number }>;
  weather: ScheduleWeather;
  raceOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface IracingSeasonOption {
  season_id: number;
  season_name: string;
  active: boolean;
  hidden: boolean;
  points_system_name: string;
}

interface IracingSeasonSessionOption {
  session_id: number;
  launch_at: string;
  race_laps: number;
  race_length: number;
  time_limit: number;
  has_results: boolean;
  track?: {
    track_id?: number;
    track_name?: string;
  };
}

export default function LeagueAdminPage() {
  const { session, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const params = useParams<{ leagueId: string }>();

  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [series, setSeries] = useState<Series[]>([]);
  const [pointsSystems, setPointsSystems] = useState<PointsSystem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateSeriesModal, setShowCreateSeriesModal] = useState(false);
  const [editingSeries, setEditingSeries] = useState<Series | null>(null);
  const [seasonsBySeries, setSeasonsBySeries] = useState<
    Record<string, Season[]>
  >({});
  const [syncingSeriesId, setSyncingSeriesId] = useState<string | null>(null);
  const [seasonModalSeries, setSeasonModalSeries] = useState<Series | null>(
    null,
  );
  const [syncModalSeries, setSyncModalSeries] = useState<Series | null>(null);
  const [editingSeasonData, setEditingSeasonData] =
    useState<EditingSeasonData | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [syncingMembers, setSyncingMembers] = useState(false);
  const [memberPage, setMemberPage] = useState(1);
  const [membersPerPage, setMembersPerPage] = useState(20);
  const [memberSearch, setMemberSearch] = useState("");
  const [standingsLimitInput, setStandingsLimitInput] = useState(10);
  const [scheduleLimitInput, setScheduleLimitInput] = useState(12);
  const [resultsLimitInput, setResultsLimitInput] = useState(20);
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
  const [widgetTargetSelector, setWidgetTargetSelector] =
    useState("#irh-widget");
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Results management
  // Schedule management
  const [schedulesBySeason, setSchedulesBySeason] = useState<
    Record<string, AdminSchedule[]>
  >({});
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedSeasonForSchedule, setSelectedSeasonForSchedule] =
    useState<Season | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

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
            (l) => String(l.iracingLeagueId) === params.leagueId,
          ) ?? null;

        if (!found) {
          setError("League not found or you are not a member.");
        } else if (!found.owner && !found.admin) {
          setError("You do not have admin access to this league.");
        } else {
          setLeague(found);
          // Fetch series and points systems
          const [seriesRes, pointsRes, membersRes] = await Promise.all([
            fetch(`/api/leagues/${found.id}/series`, { cache: "no-store" }),
            fetch(`/api/leagues/${found.id}/points-systems`, {
              cache: "no-store",
            }),
            fetch(`/api/leagues/${found.id}/members`, { cache: "no-store" }),
          ]);
          if (seriesRes.ok) {
            const seriesData = (await seriesRes.json()) as Series[];
            setSeries(seriesData);

            const seasonsEntries = await Promise.all(
              seriesData.map(async (currentSeries) => {
                const seasonsRes = await fetch(
                  `/api/leagues/${found.id}/series/${currentSeries.id}/seasons`,
                  { cache: "no-store" },
                );

                if (!seasonsRes.ok) {
                  return [currentSeries.id, []] as const;
                }

                const seasons = (await seasonsRes.json()) as Season[];
                return [currentSeries.id, seasons] as const;
              }),
            );

            setSeasonsBySeries(Object.fromEntries(seasonsEntries));
          }
          if (pointsRes.ok)
            setPointsSystems((await pointsRes.json()) as PointsSystem[]);
          if (membersRes.ok) {
            setMembers((await membersRes.json()) as Member[]);
            setMemberPage(1);
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

  const handleCreateOrUpdateSeries = async (data: {
    name: string;
    description: string;
    cars: string[];
    pointsSystemId: string;
    isActive?: boolean;
  }) => {
    if (!league) return;

    try {
      const endpoint = editingSeries
        ? `/api/leagues/${league.id}/series/${editingSeries.id}`
        : `/api/leagues/${league.id}/series`;

      const method = editingSeries ? "PATCH" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error ?? "failed_to_save");
      }

      const newSeries = (await res.json()) as Series;
      if (editingSeries) {
        setSeries(series.map((s) => (s.id === newSeries.id ? newSeries : s)));
        setEditingSeries(null);
      } else {
        setSeries([...series, newSeries]);
      }
      setShowCreateSeriesModal(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "error_saving_series");
    }
  };

  const handleRetireSeries = async (seriesId: string) => {
    if (!league) return;
    if (!confirm("Are you sure you want to retire this series?")) return;

    try {
      const res = await fetch(`/api/leagues/${league.id}/series/${seriesId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });

      if (!res.ok) throw new Error("failed_to_retire");

      setSeries(
        series.map((s) => (s.id === seriesId ? { ...s, isActive: false } : s)),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "error_retiring_series");
    }
  };

  const refreshSeriesSeasons = async (seriesId: string) => {
    if (!league) return;

    const res = await fetch(
      `/api/leagues/${league.id}/series/${seriesId}/seasons`,
      {
        cache: "no-store",
      },
    );

    if (!res.ok) {
      throw new Error("failed_to_load_seasons");
    }

    const seasons = (await res.json()) as Season[];
    setSeasonsBySeries((prev) => ({ ...prev, [seriesId]: seasons }));
  };

  const handleSyncSeasons = async (
    seriesId: string,
    seasonIds: number[],
    sessionIdsBySeason: Record<string, number[]>,
  ) => {
    if (!league) return;
    if (seasonIds.length === 0) {
      throw new Error("Please select at least one season to sync");
    }

    setSyncingSeriesId(seriesId);
    try {
      const res = await fetch(
        `/api/leagues/${league.id}/series/${seriesId}/seasons/sync`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seasonIds, sessionIdsBySeason }),
        },
      );

      if (!res.ok) {
        const errorData = (await res.json()) as { error?: string };
        throw new Error(errorData.error ?? "failed_to_sync_seasons");
      }

      const data = (await res.json()) as {
        syncedCount?: number;
        requestedCount?: number;
        importedSessionsCount?: number;
      };
      await refreshSeriesSeasons(seriesId);
      alert(
        `Synced ${data.syncedCount ?? 0} of ${data.requestedCount ?? seasonIds.length} selected season(s). Imported ${data.importedSessionsCount ?? 0} session(s).`,
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "error_syncing_seasons");
    } finally {
      setSyncingSeriesId(null);
    }
  };

  const handleCreateSeason = async (
    seriesId: string,
    data: { seasonName: string; description: string },
  ) => {
    if (!league) return;

    const seriesItem = series.find((s) => s.id === seriesId);
    if (!seriesItem) throw new Error("series_not_found");

    const cars = seriesItem.cars.map((carName, index) => ({
      car_id: -(index + 1),
      car_name: carName,
    }));

    const res = await fetch(
      `/api/leagues/${league.id}/series/${seriesId}/seasons`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonName: data.seasonName,
          description: data.description,
          cars,
        }),
      },
    );

    if (!res.ok) {
      const errorData = (await res.json()) as {
        error?: string;
        message?: string;
      };
      throw new Error(
        errorData.message ?? errorData.error ?? "failed_to_create_season",
      );
    }

    await refreshSeriesSeasons(seriesId);
  };

  const handleDeleteSeason = async (seriesId: string, seasonId: string) => {
    if (!league) return;
    if (
      !confirm(
        "Are you sure you want to delete this season? This cannot be undone.",
      )
    )
      return;

    try {
      const res = await fetch(
        `/api/leagues/${league.id}/series/${seriesId}/seasons/${seasonId}`,
        { method: "DELETE" },
      );

      if (!res.ok) throw new Error("failed_to_delete_season");

      await refreshSeriesSeasons(seriesId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "error_deleting_season");
    }
  };

  const handleUpdateSeason = async (
    seriesId: string,
    seasonId: string,
    data: { description: string },
  ) => {
    if (!league) return;

    try {
      const res = await fetch(
        `/api/leagues/${league.id}/series/${seriesId}/seasons/${seasonId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
      );

      if (!res.ok) throw new Error("failed_to_update_season");

      await refreshSeriesSeasons(seriesId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "error_updating_season");
    }
  };

  // Schedule management handlers
  const refreshSchedules = async (seasonId: string, seriesId: string) => {
    if (!league) return;

    try {
      const res = await fetch(
        `/api/leagues/${league.id}/series/${seriesId}/seasons/${seasonId}/schedules`,
        { cache: "no-store" },
      );

      if (!res.ok) throw new Error("failed_to_fetch_schedules");

      const schedules = (await res.json()) as AdminSchedule[];
      setSchedulesBySeason((prev) => ({
        ...prev,
        [seasonId]: schedules,
      }));
    } catch (err) {
      console.error("Error fetching schedules:", err);
    }
  };

  // Auto-load schedules for all seasons whenever seasonsBySeries changes
  useEffect(() => {
    if (!league) return;
    const allSeasons = Object.values(seasonsBySeries).flat();
    allSeasons.forEach((season) => {
      if (!schedulesBySeason[season.id]) {
        void refreshSchedules(season.id, season.seriesId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonsBySeries, league]);

  const openScheduleModal = (season: Season) => {
    setSelectedSeasonForSchedule(season);
    if (!schedulesBySeason[season.id]) {
      refreshSchedules(season.id, season.seriesId);
    }
    setShowScheduleModal(true);
  };

  const handleSaveSchedule = async (
    data: Omit<
      Schedule,
      "id" | "createdAt" | "updatedAt" | "seasonId" | "seriesId"
    >,
  ) => {
    if (!league || !selectedSeasonForSchedule) return;

    try {
      const url = `/api/leagues/${league.id}/series/${selectedSeasonForSchedule.seriesId}/seasons/${selectedSeasonForSchedule.id}/schedules${editingSchedule ? `/${editingSchedule.id}` : ""}`;

      const res = await fetch(url, {
        method: editingSchedule ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error("failed_to_save_schedule");

      await refreshSchedules(
        selectedSeasonForSchedule.id,
        selectedSeasonForSchedule.seriesId,
      );
    } catch (err) {
      throw err;
    }
  };

  const handleDeleteSchedule = async (seasonId: string, scheduleId: string) => {
    if (!league) return;

    const season = Object.values(seasonsBySeries)
      .flat()
      .find((s) => s.id === seasonId);
    if (!season) return;

    if (!confirm("Delete this race from the schedule?")) return;

    try {
      const res = await fetch(
        `/api/leagues/${league.id}/series/${season.seriesId}/seasons/${seasonId}/schedules/${scheduleId}`,
        { method: "DELETE" },
      );

      if (!res.ok) throw new Error("failed_to_delete_schedule");

      await refreshSchedules(seasonId, season.seriesId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "error_deleting_schedule");
    }
  };

  const handleSyncMembers = async () => {
    if (!league) return;

    setSyncingMembers(true);
    try {
      const res = await fetch(`/api/leagues/${league.id}/members/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const errorData = (await res.json()) as {
          error?: string;
          message?: string;
        };
        throw new Error(
          errorData.message ?? errorData.error ?? "failed_to_sync_members",
        );
      }

      const data = (await res.json()) as {
        syncedCount?: number;
        totalMembers?: number;
        failedCount?: number;
        removedCount?: number;
      };

      // Reload members
      const membersRes = await fetch(`/api/leagues/${league.id}/members`, {
        cache: "no-store",
      });
      if (membersRes.ok) {
        setMembers((await membersRes.json()) as Member[]);
        setMemberPage(1);
      }

      const removedMsg = data.removedCount
        ? ` Removed ${data.removedCount} member${data.removedCount !== 1 ? "s" : ""} no longer on roster.`
        : "";
      const failedMsg = data.failedCount ? ` ${data.failedCount} failed.` : "";
      alert(
        `Synced ${data.syncedCount ?? 0} of ${data.totalMembers ?? 0} members.${removedMsg}${failedMsg}`,
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "error_syncing_members");
    } finally {
      setSyncingMembers(false);
    }
  };

  const clampInt = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

  const applyWidgetPreset = (
    preset: "custom" | "nascar-red" | "dark-slate" | "light-clean",
  ) => {
    setWidgetPreset(preset);

    if (preset === "custom") {
      return;
    }

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

    setWidgetTheme("light");
    setWidgetAccentColor("#2563eb");
    setWidgetBgColor("#ffffff");
    setWidgetNoBackground(false);
    setWidgetTextColor("#111827");
    setWidgetBorderColor("#e5e7eb");
  };

  const standingsLimit = clampInt(standingsLimitInput, 1, 50);
  const scheduleLimit = clampInt(scheduleLimitInput, 1, 50);
  const resultsLimit = clampInt(resultsLimitInput, 1, 100);
  const widgetOrigin =
    typeof window === "undefined" ? "" : window.location.origin;

  const widgetLeagueId = league ? String(league.iracingLeagueId) : "";
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

  const feedPath = `/api/widgets/leagues/${widgetLeagueId}?${widgetQuery}`;
  const embedPath = `/api/widgets/leagues/${widgetLeagueId}/embed?${widgetQuery}`;
  const feedUrl = widgetOrigin ? `${widgetOrigin}${feedPath}` : feedPath;
  const embedUrl = widgetOrigin ? `${widgetOrigin}${embedPath}` : embedPath;

  const getEmbedUrlForView = (
    view: "all" | "upcoming" | "results" | "standings" | "schedule",
  ) => {
    const params = new URLSearchParams(widgetQueryParams);
    params.set("view", view);
    const path = `/api/widgets/leagues/${widgetLeagueId}/embed?${params.toString()}`;
    return widgetOrigin ? `${widgetOrigin}${path}` : path;
  };

  const getEmbedCodeForView = (
    view: "all" | "upcoming" | "results" | "standings" | "schedule",
  ) => {
    const viewEmbedUrl = getEmbedUrlForView(view);
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
    <script src="${previewEmbedUrl}" data-target="#irh-widget-preview"></script>
  </body>
</html>`;
  const embedCode = getEmbedCodeForView(widgetView);

  const copyText = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(label);
      setTimeout(
        () => setCopiedField((current) => (current === label ? null : current)),
        1800,
      );
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

  const normalizedMemberSearch = memberSearch.trim().toLowerCase();
  const filteredMembers = members.filter((member) => {
    if (!normalizedMemberSearch) return true;

    const searchable = [
      member.displayName,
      member.nickName ?? "",
      member.carNumber ?? "",
      String(member.custId),
    ]
      .join(" ")
      .toLowerCase();

    return searchable.includes(normalizedMemberSearch);
  });

  const totalMemberPages = Math.max(
    1,
    Math.ceil(filteredMembers.length / membersPerPage),
  );
  const currentMemberPage = Math.min(memberPage, totalMemberPages);
  const memberStartIndex = (currentMemberPage - 1) * membersPerPage;
  const paginatedMembers = filteredMembers.slice(
    memberStartIndex,
    memberStartIndex + membersPerPage,
  );
  const showingFrom = filteredMembers.length === 0 ? 0 : memberStartIndex + 1;
  const showingTo = Math.min(
    memberStartIndex + membersPerPage,
    filteredMembers.length,
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
            {league && (
              <Link
                href={`/app/${league.iracingLeagueId}`}
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                ← League View
              </Link>
            )}
            <Link
              href="/dashboard"
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Dashboard
            </Link>
            <button
              onClick={logout}
              className="rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors px-4 py-1.5 text-sm font-medium text-zinc-300 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        {error ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
            <p className="text-red-400 text-sm">{error}</p>
            <Link
              href="/dashboard"
              className="mt-4 inline-block text-sm text-zinc-400 hover:text-white"
            >
              ← Back to Dashboard
            </Link>
          </div>
        ) : league ? (
          <>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full bg-red-500/10 border border-red-500/30 px-3 py-0.5 text-xs font-semibold text-red-400 uppercase tracking-widest">
                Admin Panel
              </span>
            </div>
            <div className="mb-10 flex items-start gap-4">
              {league.smallLogo ? (
                <Image
                  src={league.smallLogo}
                  alt={league.leagueName}
                  width={64}
                  height={64}
                  unoptimized
                  className="h-16 w-16 rounded-xl object-cover border border-zinc-800"
                />
              ) : (
                <div className="h-16 w-16 rounded-xl bg-zinc-800 flex items-center justify-center text-2xl shrink-0">
                  🏁
                </div>
              )}
              <div>
                <h1 className="text-3xl font-black tracking-tight mb-1">
                  {league.leagueName}
                </h1>
                <p className="text-zinc-400 text-sm">
                  iRacing League ID: {league.iracingLeagueId}
                  {league.rosterCount != null
                    ? ` · ${league.rosterCount} members`
                    : ""}
                </p>
                <p className="text-xs mt-1 text-zinc-500">
                  Role:{" "}
                  <span className="text-zinc-300">
                    {league.owner ? "Owner" : "Admin"}
                  </span>
                </p>
              </div>
            </div>

            {/* Points Systems Section */}
            <div className="mb-12">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Points Systems</h2>
                <Link
                  href={`/app/${params.leagueId}/admin/points-system`}
                  className="rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors px-4 py-2 text-sm font-medium text-white border border-zinc-700"
                >
                  + Create Custom System
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                {pointsSystems
                  .filter((ps) => ps.leagueId === null) // Show only preset systems
                  .slice(0, 6) // Limit to 6 presets
                  .map((ps) => (
                    <div
                      key={ps.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold">{ps.name}</h3>
                        {ps.isPreset && (
                          <span className="rounded px-2 py-0.5 text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/30">
                            {ps.presetType?.toUpperCase()}
                          </span>
                        )}
                      </div>
                      {ps.description && (
                        <p className="text-xs text-zinc-400 mb-3">
                          {ps.description}
                        </p>
                      )}
                      <div className="text-xs text-zinc-500">
                        Position points set for top finishers
                      </div>
                    </div>
                  ))}
              </div>

              {pointsSystems.some((ps) => ps.leagueId === params.leagueId) ? (
                <div>
                  <h3 className="text-sm font-semibold text-zinc-300 mb-3">
                    Custom Systems
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pointsSystems
                      .filter((ps) => ps.leagueId === params.leagueId)
                      .map((ps) => (
                        <div
                          key={ps.id}
                          className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 transition-colors"
                        >
                          <h3 className="font-semibold text-white">
                            {ps.name}
                          </h3>
                          {ps.description && (
                            <p className="text-xs text-zinc-400 mt-1">
                              {ps.description}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Series Management Section */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Series</h2>
                <button
                  onClick={() => {
                    setEditingSeries(null);
                    setShowCreateSeriesModal(true);
                  }}
                  className="rounded-lg bg-red-500 hover:bg-red-600 transition-colors px-4 py-2 text-sm font-medium text-white"
                >
                  + Create Series
                </button>
              </div>

              {series.length === 0 ? (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
                  <p className="text-zinc-400 text-sm mb-4">
                    No series created yet
                  </p>
                  <button
                    onClick={() => {
                      setEditingSeries(null);
                      setShowCreateSeriesModal(true);
                    }}
                    className="text-red-400 hover:text-red-300 text-sm font-medium"
                  >
                    Create your first series →
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {series.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-lg">{s.name}</h3>
                            {s.isActive && (
                              <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/30">
                                Active
                              </span>
                            )}
                          </div>
                          {s.description && (
                            <p className="text-sm text-zinc-400">
                              {s.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {!s.isActive && (
                            <span className="rounded px-2 py-1 text-xs font-medium bg-zinc-800 text-zinc-400 uppercase">
                              Retired
                            </span>
                          )}
                          <span className="rounded-full px-2.5 py-1 text-xs font-medium bg-blue-500/10 text-blue-300 border border-blue-500/30">
                            {(seasonsBySeries[s.id] ?? []).length} season
                            {(seasonsBySeries[s.id] ?? []).length !== 1
                              ? "s"
                              : ""}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-sm mb-4 pb-4 border-b border-zinc-800">
                        <div>
                          <span className="text-zinc-500 text-xs uppercase tracking-widest">
                            Cars
                          </span>
                          <p className="text-zinc-200 mt-1 text-sm">
                            {s.cars.length > 0
                              ? `${s.cars.length} car${s.cars.length !== 1 ? "s" : ""}`
                              : "None"}
                          </p>
                        </div>
                        <div>
                          <span className="text-zinc-500 text-xs uppercase tracking-widest">
                            Points System
                          </span>
                          <p className="text-zinc-200 mt-1 text-sm">
                            {s.pointsSystem.name}
                          </p>
                        </div>
                        <div>
                          <span className="text-zinc-500 text-xs uppercase tracking-widest">
                            Created
                          </span>
                          <p className="text-zinc-200 mt-1 text-sm">
                            {new Date(s.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      {s.isActive && (
                        <div className="flex gap-2 mb-4">
                          <button
                            onClick={() => {
                              setEditingSeries(s);
                              setShowCreateSeriesModal(true);
                            }}
                            className="text-sm px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleRetireSeries(s.id)}
                            className="text-sm px-3 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:border-red-500/50 hover:text-red-400 transition-colors"
                          >
                            Retire
                          </button>
                        </div>
                      )}

                      <div className="mt-4 border-t border-zinc-800 pt-4">
                        <div className="mb-3 flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-zinc-200">
                            Seasons ({(seasonsBySeries[s.id] ?? []).length})
                          </h4>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setSyncModalSeries(s)}
                              className="text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors disabled:opacity-60"
                            >
                              {syncingSeriesId === s.id
                                ? "Syncing..."
                                : "Sync from iRacing"}
                            </button>
                            <button
                              onClick={() => setSeasonModalSeries(s)}
                              className="text-xs px-2.5 py-1.5 rounded bg-red-500 hover:bg-red-600 text-white transition-colors"
                            >
                              + Create
                            </button>
                          </div>
                        </div>

                        {(seasonsBySeries[s.id] ?? []).length === 0 ? (
                          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 text-center">
                            <p className="text-xs text-zinc-500">
                              No seasons yet. Create a custom one or sync from
                              iRacing.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {(seasonsBySeries[s.id] ?? []).map((season) => (
                              <div
                                key={season.id}
                                className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 hover:border-zinc-700 transition-colors"
                              >
                                <div className="flex items-start justify-between gap-3 mb-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-zinc-100 font-medium">
                                      {season.seasonName}
                                    </p>
                                    <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1">
                                      <span>
                                        {season.cars?.length ?? 0} cars
                                      </span>
                                      {season.iracingPointsSystemName && (
                                        <>
                                          <span>•</span>
                                          <span>
                                            {season.iracingPointsSystemName}
                                          </span>
                                        </>
                                      )}
                                      {season.lastSyncedAt && (
                                        <>
                                          <span>•</span>
                                          <span>
                                            Synced{" "}
                                            {new Date(
                                              season.lastSyncedAt,
                                            ).toLocaleDateString()}
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <span
                                      className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase whitespace-nowrap ${
                                        season.isSynced
                                          ? "bg-blue-500/10 text-blue-300 border border-blue-500/30"
                                          : "bg-zinc-800 text-zinc-400 border border-zinc-700"
                                      }`}
                                    >
                                      {season.isSynced ? "Synced" : "Custom"}
                                    </span>
                                    {!season.isActive && (
                                      <span className="rounded px-2 py-0.5 text-[10px] font-medium uppercase bg-zinc-800 text-zinc-400 border border-zinc-700">
                                        Inactive
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex gap-1 pt-2 border-t border-zinc-800/50">
                                  <button
                                    onClick={() =>
                                      setEditingSeasonData({
                                        seriesId: s.id,
                                        seasonId: season.id,
                                      })
                                    }
                                    className="flex-1 text-xs px-2 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleDeleteSeason(s.id, season.id)
                                    }
                                    className="flex-1 text-xs px-2 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:border-red-500/50 hover:text-red-400 transition-colors"
                                  >
                                    Delete
                                  </button>
                                </div>

                                {/* Schedule management — expandable events with inline results & import */}
                                {league && (
                                  <AdminScheduleSection
                                    leagueId={league.id}
                                    iracingLeagueId={league.iracingLeagueId}
                                    seriesId={s.id}
                                    season={{
                                      id: season.id,
                                      seasonName: season.seasonName,
                                      iracingSeasonId:
                                        season.iracingSeasonId ?? null,
                                    }}
                                    schedules={
                                      schedulesBySeason[season.id] ?? []
                                    }
                                    onAddSchedule={() => {
                                      setEditingSchedule(null);
                                      openScheduleModal(season);
                                    }}
                                    onEditSchedule={(schedule) => {
                                      setEditingSchedule(
                                        schedule as unknown as Schedule,
                                      );
                                      openScheduleModal(season);
                                    }}
                                    onDeleteSchedule={(schedule) =>
                                      handleDeleteSchedule(
                                        season.id,
                                        schedule.id,
                                      )
                                    }
                                    onRefresh={() =>
                                      refreshSchedules(season.id, s.id)
                                    }
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Members Management Section */}
            <div className="mb-12">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold">Widgets</h2>
                  <p className="text-sm text-zinc-400 mt-1">
                    Generate league widget links and embeddable code.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <label className="text-xs text-zinc-400 space-y-1">
                    <span className="block">Style Preset</span>
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
                  <label className="text-xs text-zinc-400 space-y-1">
                    <span className="block">Widget Type</span>
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
                  <label className="text-xs text-zinc-400 space-y-1">
                    <span className="block">Theme</span>
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
                  <label className="text-xs text-zinc-400 space-y-1">
                    <span className="block">Standings Limit (1-50)</span>
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
                  <label className="text-xs text-zinc-400 space-y-1">
                    <span className="block">Schedule Limit (1-50)</span>
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
                  <label className="text-xs text-zinc-400 space-y-1">
                    <span className="block">Results Limit (1-100)</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={resultsLimitInput}
                      onChange={(e) =>
                        setResultsLimitInput(
                          Number.parseInt(e.target.value, 10) || 20,
                        )
                      }
                      className="w-full rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                    />
                  </label>
                  <label className="text-xs text-zinc-400 space-y-1">
                    <span className="block">Target Selector</span>
                    <input
                      type="text"
                      value={widgetTargetSelector}
                      onChange={(e) => setWidgetTargetSelector(e.target.value)}
                      placeholder="#irh-widget"
                      className="w-full rounded-lg bg-zinc-950 border border-zinc-700 text-zinc-200 px-3 py-2 text-sm focus:outline-none focus:border-red-500"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <label className="text-xs text-zinc-400 space-y-1">
                    <span className="block">Accent Color</span>
                    <input
                      type="color"
                      value={widgetAccentColor}
                      onChange={(e) => {
                        setWidgetPreset("custom");
                        setWidgetAccentColor(e.target.value);
                      }}
                      className="h-10 w-full rounded-lg bg-zinc-950 border border-zinc-700 p-1"
                    />
                  </label>
                  <label className="text-xs text-zinc-400 space-y-1">
                    <span className="block">Background Color</span>
                    <input
                      type="color"
                      value={widgetBgColor}
                      onChange={(e) => {
                        setWidgetPreset("custom");
                        setWidgetNoBackground(false);
                        setWidgetBgColor(e.target.value);
                      }}
                      disabled={widgetNoBackground}
                      className="h-10 w-full rounded-lg bg-zinc-950 border border-zinc-700 p-1"
                    />
                  </label>
                  <label className="text-xs text-zinc-400 space-y-1">
                    <span className="block">Text Color</span>
                    <input
                      type="color"
                      value={widgetTextColor}
                      onChange={(e) => {
                        setWidgetPreset("custom");
                        setWidgetTextColor(e.target.value);
                      }}
                      className="h-10 w-full rounded-lg bg-zinc-950 border border-zinc-700 p-1"
                    />
                  </label>
                  <label className="text-xs text-zinc-400 space-y-1">
                    <span className="block">Border Color</span>
                    <input
                      type="color"
                      value={widgetBorderColor}
                      onChange={(e) => {
                        setWidgetPreset("custom");
                        setWidgetBorderColor(e.target.value);
                      }}
                      className="h-10 w-full rounded-lg bg-zinc-950 border border-zinc-700 p-1"
                    />
                  </label>
                </div>

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
                  No background color (transparent)
                </label>

                <label className="inline-flex items-center gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={widgetCompactMode}
                    onChange={(e) => {
                      setWidgetCompactMode(e.target.checked);
                    }}
                    className="h-4 w-4 rounded border-zinc-700 bg-zinc-950"
                  />
                  Compact table mode (standings/results)
                </label>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-zinc-200">
                      Feed URL
                    </p>
                    <button
                      onClick={() => copyText("feed", feedUrl)}
                      className="text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                    >
                      {copiedField === "feed" ? "Copied" : "Copy URL"}
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={feedUrl}
                    rows={2}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 px-3 py-2 text-xs font-mono"
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-zinc-200">
                      Embed Script URL
                    </p>
                    <button
                      onClick={() => copyText("embedUrl", embedUrl)}
                      className="text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                    >
                      {copiedField === "embedUrl" ? "Copied" : "Copy URL"}
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={embedUrl}
                    rows={2}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 px-3 py-2 text-xs font-mono"
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-zinc-200">
                      Copy/Paste Embed Code
                    </p>
                    <button
                      onClick={() => copyText("embedCode", embedCode)}
                      className="text-xs px-2.5 py-1.5 rounded bg-red-500 hover:bg-red-600 text-white transition-colors"
                    >
                      {copiedField === "embedCode" ? "Copied" : "Copy Code"}
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={embedCode}
                    rows={4}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 px-3 py-2 text-xs font-mono"
                  />
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-zinc-200">
                    Quick Copy: Single Widgets
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() =>
                        copyText("copy-all", getEmbedCodeForView("all"))
                      }
                      className="text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                    >
                      {copiedField === "copy-all" ? "Copied" : "All"}
                    </button>
                    <button
                      onClick={() =>
                        copyText(
                          "copy-upcoming",
                          getEmbedCodeForView("upcoming"),
                        )
                      }
                      className="text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                    >
                      {copiedField === "copy-upcoming" ? "Copied" : "Upcoming"}
                    </button>
                    <button
                      onClick={() =>
                        copyText("copy-results", getEmbedCodeForView("results"))
                      }
                      className="text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                    >
                      {copiedField === "copy-results" ? "Copied" : "Results"}
                    </button>
                    <button
                      onClick={() =>
                        copyText(
                          "copy-standings",
                          getEmbedCodeForView("standings"),
                        )
                      }
                      className="text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                    >
                      {copiedField === "copy-standings"
                        ? "Copied"
                        : "Standings"}
                    </button>
                    <button
                      onClick={() =>
                        copyText(
                          "copy-schedule",
                          getEmbedCodeForView("schedule"),
                        )
                      }
                      className="text-xs px-2.5 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                    >
                      {copiedField === "copy-schedule" ? "Copied" : "Schedule"}
                    </button>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-zinc-200">
                    Widget Preview
                  </p>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                    <iframe
                      title="League widget preview"
                      srcDoc={widgetPreviewSrcDoc}
                      className="w-full min-h-[540px] rounded border border-zinc-800 bg-zinc-950"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-12">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold">Members</h2>
                  <p className="text-sm text-zinc-400 mt-1">
                    {members.length} total members
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => {
                      setMemberSearch(e.target.value);
                      setMemberPage(1);
                    }}
                    placeholder="Search name, nick, #, ID..."
                    className="w-52 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 px-3 py-1.5 text-xs focus:outline-none focus:border-red-500"
                  />
                  <label className="text-xs text-zinc-400">Per page</label>
                  <select
                    value={membersPerPage}
                    onChange={(e) => {
                      setMembersPerPage(Number(e.target.value));
                      setMemberPage(1);
                    }}
                    className="rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 px-2 py-1 text-xs focus:outline-none focus:border-red-500"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                  <button
                    onClick={handleSyncMembers}
                    disabled={syncingMembers}
                    className="rounded-lg bg-red-500 hover:bg-red-600 disabled:bg-red-600/50 transition-colors px-4 py-2 text-sm font-medium text-white"
                  >
                    {syncingMembers ? "Syncing..." : "Sync from iRacing"}
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
                  <div className="inline-block h-8 w-8 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
                </div>
              ) : members.length === 0 ? (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
                  <p className="text-zinc-400 text-sm mb-4">
                    No members synced yet
                  </p>
                  <button
                    onClick={handleSyncMembers}
                    disabled={syncingMembers}
                    className="text-red-400 hover:text-red-300 text-sm font-medium"
                  >
                    Sync members from iRacing →
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                    <p className="text-xs text-zinc-400">
                      Showing {showingFrom}-{showingTo} of{" "}
                      {filteredMembers.length}
                      {memberSearch.trim()
                        ? ` (filtered from ${members.length})`
                        : ""}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setMemberPage((prev) => Math.max(1, prev - 1))
                        }
                        disabled={currentMemberPage === 1}
                        className="text-xs px-2.5 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Prev
                      </button>
                      <span className="text-xs text-zinc-400">
                        Page {currentMemberPage} / {totalMemberPages}
                      </span>
                      <button
                        onClick={() =>
                          setMemberPage((prev) =>
                            Math.min(totalMemberPages, prev + 1),
                          )
                        }
                        disabled={currentMemberPage >= totalMemberPages}
                        className="text-xs px-2.5 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>

                  {paginatedMembers.length === 0 ? (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-center">
                      <p className="text-sm text-zinc-400">
                        No members match your search.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {paginatedMembers.map((member) => (
                        <div
                          key={member.id}
                          className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 transition-colors"
                        >
                          <div className="flex items-start gap-4">
                            {/* Helmet Visual */}
                            <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center text-sm font-bold">
                              {member.helmet?.color1 ? (
                                <div
                                  className="w-full h-full rounded-lg flex items-center justify-center text-white font-bold"
                                  style={{
                                    backgroundColor: `#${member.helmet.color1}`,
                                  }}
                                >
                                  {member.carNumber || "👤"}
                                </div>
                              ) : (
                                "👤"
                              )}
                            </div>

                            {/* Member Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold text-white">
                                  {member.displayName}
                                </h3>
                                {member.nickName && (
                                  <span className="text-xs text-zinc-500">
                                    ({member.nickName})
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2 mb-2">
                                {member.owner && (
                                  <span className="rounded px-2 py-0.5 text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
                                    Owner
                                  </span>
                                )}
                                {member.admin && (
                                  <span className="rounded px-2 py-0.5 text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/30">
                                    Admin
                                  </span>
                                )}
                                {member.carNumber && (
                                  <span className="rounded px-2 py-0.5 text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700">
                                    #{member.carNumber}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-zinc-500">
                                Member since{" "}
                                {new Date(
                                  member.leagueMemberSince,
                                ).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Other admin sections */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
              {[
                {
                  icon: "👥",
                  label: "Members",
                  description:
                    "View roster, manage member roles, and track participation.",
                },
                {
                  icon: "📅",
                  label: "Schedule",
                  description:
                    "Set up race schedules, tracks, and event details.",
                },
                {
                  icon: "⚙️",
                  label: "Settings",
                  description:
                    "Configure league settings, privacy, and branding.",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 hover:border-zinc-600 transition-colors cursor-pointer"
                >
                  <div className="text-2xl mb-3">{item.icon}</div>
                  <h3 className="font-bold mb-1">{item.label}</h3>
                  <p className="text-sm text-zinc-500">{item.description}</p>
                  <p className="text-xs text-zinc-600 mt-3">Coming soon</p>
                </div>
              ))}
            </div>

            {/* Create/Edit Series Modal */}
            {showCreateSeriesModal && (
              <CreateSeriesModal
                editingSeries={editingSeries}
                pointsSystems={pointsSystems}
                onSave={handleCreateOrUpdateSeries}
                onClose={() => {
                  setShowCreateSeriesModal(false);
                  setEditingSeries(null);
                }}
              />
            )}

            {seasonModalSeries && (
              <CreateSeasonModal
                seriesName={seasonModalSeries.name}
                onSave={async (data) => {
                  await handleCreateSeason(seasonModalSeries.id, data);
                  setSeasonModalSeries(null);
                }}
                onClose={() => setSeasonModalSeries(null)}
              />
            )}

            {editingSeasonData &&
              (() => {
                const currentSeries = series.find(
                  (s) => s.id === editingSeasonData.seriesId,
                );
                const currentSeason = (
                  seasonsBySeries[editingSeasonData.seriesId] ?? []
                ).find((s) => s.id === editingSeasonData.seasonId);
                if (!currentSeries || !currentSeason) return null;

                return (
                  <EditSeasonModal
                    season={currentSeason}
                    seriesName={currentSeries.name}
                    onUpdate={async (data) => {
                      await handleUpdateSeason(
                        editingSeasonData.seriesId,
                        editingSeasonData.seasonId,
                        data,
                      );
                      setEditingSeasonData(null);
                    }}
                    onClose={() => setEditingSeasonData(null)}
                  />
                );
              })()}

            {syncModalSeries && league && (
              <SyncSeasonsModal
                leagueIracingId={league.iracingLeagueId}
                seriesName={syncModalSeries.name}
                existingIracingSeasonIds={(
                  seasonsBySeries[syncModalSeries.id] ?? []
                )
                  .map((season) => season.iracingSeasonId)
                  .filter((id): id is number => typeof id === "number")}
                onSync={async (selectedSeasonIds, sessionIdsBySeason) => {
                  await handleSyncSeasons(
                    syncModalSeries.id,
                    selectedSeasonIds,
                    sessionIdsBySeason,
                  );
                  setSyncModalSeries(null);
                }}
                onClose={() => setSyncModalSeries(null)}
              />
            )}

            {showScheduleModal && selectedSeasonForSchedule && league && (
              <AddScheduleModal
                isOpen={showScheduleModal}
                onClose={() => {
                  setShowScheduleModal(false);
                  setEditingSchedule(null);
                }}
                onSubmit={handleSaveSchedule}
                leagueId={league.id}
                seriesId={selectedSeasonForSchedule.seriesId}
                seasonId={selectedSeasonForSchedule.id}
                existingSchedule={editingSchedule || undefined}
                nextRaceOrder={
                  (schedulesBySeason[selectedSeasonForSchedule.id] ?? [])
                    .length + 1
                }
              />
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}

interface SyncSeasonsModalProps {
  leagueIracingId: number;
  seriesName: string;
  existingIracingSeasonIds: number[];
  onSync: (
    seasonIds: number[],
    sessionIdsBySeason: Record<string, number[]>,
  ) => Promise<void>;
  onClose: () => void;
}

function SyncSeasonsModal({
  leagueIracingId,
  seriesName,
  existingIracingSeasonIds,
  onSync,
  onClose,
}: SyncSeasonsModalProps) {
  const [availableSeasons, setAvailableSeasons] = useState<
    IracingSeasonOption[]
  >([]);
  const [selectedSeasonIds, setSelectedSeasonIds] = useState<number[]>([]);
  const [seasonSessionsBySeasonId, setSeasonSessionsBySeasonId] = useState<
    Record<number, IracingSeasonSessionOption[]>
  >({});
  const [selectedSessionIdsBySeason, setSelectedSessionIdsBySeason] = useState<
    Record<number, number[]>
  >({});
  const [loadingSeasonSessionsBySeason, setLoadingSeasonSessionsBySeason] =
    useState<Record<number, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/iracing/league-seasons?league_id=${leagueIracingId}`)
      .then((r) => r.json())
      .then((data: IracingSeasonOption[]) => {
        if (!cancelled) {
          setAvailableSeasons(Array.isArray(data) ? data : []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableSeasons([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [leagueIracingId]);

  const toggleSeasonSelection = (seasonId: number) => {
    const selecting = !selectedSeasonIds.includes(seasonId);
    setSelectedSeasonIds((prev) =>
      prev.includes(seasonId)
        ? prev.filter((id) => id !== seasonId)
        : [...prev, seasonId],
    );

    if (selecting && !seasonSessionsBySeasonId[seasonId]) {
      void loadSeasonSessions(seasonId);
    }
  };

  const loadSeasonSessions = async (seasonId: number) => {
    if (seasonSessionsBySeasonId[seasonId]) return;

    setLoadingSeasonSessionsBySeason((prev) => ({ ...prev, [seasonId]: true }));
    try {
      const res = await fetch(
        `/api/iracing/league-season-sessions?league_id=${leagueIracingId}&season_id=${seasonId}`,
      );
      if (!res.ok) throw new Error("failed_to_fetch_season_sessions");

      const sessions = (await res.json()) as IracingSeasonSessionOption[];
      const normalized = Array.isArray(sessions) ? sessions : [];

      setSeasonSessionsBySeasonId((prev) => ({
        ...prev,
        [seasonId]: normalized,
      }));
      setSelectedSessionIdsBySeason((prev) => ({
        ...prev,
        [seasonId]: normalized.map((s) => s.session_id),
      }));
    } catch {
      setSeasonSessionsBySeasonId((prev) => ({ ...prev, [seasonId]: [] }));
      setSelectedSessionIdsBySeason((prev) => ({ ...prev, [seasonId]: [] }));
    } finally {
      setLoadingSeasonSessionsBySeason((prev) => ({
        ...prev,
        [seasonId]: false,
      }));
    }
  };

  const toggleSessionSelection = (seasonId: number, sessionId: number) => {
    setSelectedSessionIdsBySeason((prev) => {
      const current = prev[seasonId] ?? [];
      return {
        ...prev,
        [seasonId]: current.includes(sessionId)
          ? current.filter((id) => id !== sessionId)
          : [...current, sessionId],
      };
    });
  };

  const selectAllSeasons = () => {
    setSelectedSeasonIds(availableSeasons.map((s) => s.season_id));
  };

  const clearAllSeasons = () => {
    setSelectedSeasonIds([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSeasonIds.length === 0) {
      alert("Please select at least one season");
      return;
    }

    setIsSyncing(true);
    try {
      const payload = Object.fromEntries(
        selectedSeasonIds.map((seasonId) => [
          String(seasonId),
          selectedSessionIdsBySeason[seasonId] ?? [],
        ]),
      );
      await onSync(selectedSeasonIds, payload);
    } catch (err) {
      alert(err instanceof Error ? err.message : "failed_to_sync_seasons");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 rounded-2xl border border-zinc-800 max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-1 text-white">
          Sync Seasons from iRacing
        </h2>
        <p className="text-sm text-zinc-400 mb-4">Series: {seriesName}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/70">
            <div className="flex items-center justify-between p-3 border-b border-zinc-800">
              <p className="text-xs font-medium text-zinc-300">
                {selectedSeasonIds.length} selected
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllSeasons}
                  className="text-xs px-2.5 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                  disabled={isLoading}
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={clearAllSeasons}
                  className="text-xs px-2.5 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                  disabled={isLoading}
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {isLoading ? (
                <div className="p-4 text-sm text-zinc-500 text-center">
                  Loading seasons...
                </div>
              ) : availableSeasons.length === 0 ? (
                <div className="p-4 text-sm text-zinc-500 text-center">
                  No iRacing seasons found.
                </div>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {availableSeasons.map((season) => {
                    const isSelected = selectedSeasonIds.includes(
                      season.season_id,
                    );
                    const isAlreadyAssigned = existingIracingSeasonIds.includes(
                      season.season_id,
                    );

                    return (
                      <button
                        key={season.season_id}
                        type="button"
                        onClick={() => toggleSeasonSelection(season.season_id)}
                        className={`w-full text-left p-3 hover:bg-zinc-800/60 transition-colors ${
                          isSelected ? "bg-red-500/10" : ""
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-[10px] ${
                              isSelected
                                ? "bg-red-500 border-red-500 text-white"
                                : "border-zinc-600"
                            }`}
                          >
                            {isSelected ? "✓" : ""}
                          </span>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-100">
                              {season.season_name}
                            </p>
                            <p className="text-xs text-zinc-500 mt-0.5">
                              {season.points_system_name || "No points system"}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {isAlreadyAssigned && (
                              <span className="rounded px-2 py-0.5 text-[10px] font-medium uppercase bg-blue-500/10 text-blue-300 border border-blue-500/30">
                                Assigned
                              </span>
                            )}
                            {!season.active && (
                              <span className="rounded px-2 py-0.5 text-[10px] font-medium uppercase bg-zinc-800 text-zinc-400 border border-zinc-700">
                                Inactive
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-zinc-500">
            Select one or more seasons to assign and sync to this series.
          </p>

          {selectedSeasonIds.length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 space-y-3">
              <p className="text-xs font-medium text-zinc-300">
                Select sessions to import as schedule entries
              </p>
              {selectedSeasonIds.map((seasonId) => {
                const season = availableSeasons.find(
                  (value) => value.season_id === seasonId,
                );
                const sessions = seasonSessionsBySeasonId[seasonId] ?? [];
                const selectedSessions =
                  selectedSessionIdsBySeason[seasonId] ?? [];
                const isLoadingSessions =
                  loadingSeasonSessionsBySeason[seasonId];

                return (
                  <div
                    key={seasonId}
                    className="rounded border border-zinc-800 bg-zinc-900/70"
                  >
                    <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between">
                      <p className="text-xs text-zinc-300 font-medium">
                        {season?.season_name ?? `Season ${seasonId}`}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {selectedSessions.length} selected
                      </p>
                    </div>
                    <div className="max-h-44 overflow-y-auto divide-y divide-zinc-800">
                      {isLoadingSessions ? (
                        <p className="px-3 py-2 text-xs text-zinc-500">
                          Loading sessions...
                        </p>
                      ) : sessions.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-zinc-500">
                          No sessions found for this season.
                        </p>
                      ) : (
                        sessions.map((session) => {
                          const isSelected = selectedSessions.includes(
                            session.session_id,
                          );
                          return (
                            <button
                              key={session.session_id}
                              type="button"
                              onClick={() =>
                                toggleSessionSelection(
                                  seasonId,
                                  session.session_id,
                                )
                              }
                              className={`w-full text-left px-3 py-2 hover:bg-zinc-800/50 transition-colors ${
                                isSelected ? "bg-red-500/10" : ""
                              }`}
                            >
                              <p className="text-xs text-zinc-200">
                                {session.track?.track_name ??
                                  `Session ${session.session_id}`}
                              </p>
                              <p className="text-[11px] text-zinc-500 mt-0.5">
                                {new Date(session.launch_at).toLocaleString()} ·
                                ID {session.session_id}
                              </p>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={isSyncing || selectedSeasonIds.length === 0}
              className="flex-1 rounded-lg bg-red-500 hover:bg-red-600 disabled:bg-red-600/50 transition-colors px-4 py-2 text-sm font-medium text-white"
            >
              {isSyncing
                ? "Syncing..."
                : `Sync Selected (${selectedSeasonIds.length})`}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface CreateSeasonModalProps {
  seriesName: string;
  onSave: (data: { seasonName: string; description: string }) => Promise<void>;
  onClose: () => void;
}

function CreateSeasonModal({
  seriesName,
  onSave,
  onClose,
}: CreateSeasonModalProps) {
  const [seasonName, setSeasonName] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seasonName.trim()) {
      alert("Season name is required");
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        seasonName: seasonName.trim(),
        description: description.trim(),
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "failed_to_create_season");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 rounded-2xl border border-zinc-800 max-w-lg w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-1 text-white">Create Season</h2>
        <p className="text-sm text-zinc-400 mb-4">Series: {seriesName}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Season Name *
            </label>
            <input
              type="text"
              value={seasonName}
              onChange={(e) => setSeasonName(e.target.value)}
              placeholder="e.g., 2026 Season 1"
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-3 py-2 focus:outline-none focus:border-red-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional season description"
              rows={3}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-3 py-2 focus:outline-none focus:border-red-500 resize-none"
            />
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
            <p className="text-xs text-zinc-500">
              This creates a custom season using the cars currently configured
              on this series.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 rounded-lg bg-red-500 hover:bg-red-600 disabled:bg-red-600/50 transition-colors px-4 py-2 text-sm font-medium text-white"
            >
              {isSaving ? "Saving..." : "Create Season"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface EditSeasonModalProps {
  season: Season;
  seriesName: string;
  onUpdate: (data: { description: string }) => Promise<void>;
  onClose: () => void;
}

function EditSeasonModal({
  season,
  seriesName,
  onUpdate,
  onClose,
}: EditSeasonModalProps) {
  const [description, setDescription] = useState(season.description || "");
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onUpdate({ description: description.trim() });
    } catch (err) {
      alert(err instanceof Error ? err.message : "failed_to_update_season");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 rounded-2xl border border-zinc-800 max-w-lg w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-1 text-white">Edit Season</h2>
        <p className="text-sm text-zinc-400 mb-4">
          {season.seasonName} · {seriesName}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Season Name
            </label>
            <input
              type="text"
              value={season.seasonName}
              disabled
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-500 px-3 py-2 cursor-not-allowed"
            />
            <p className="text-xs text-zinc-500 mt-1">
              Season name cannot be changed
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional season description"
              rows={3}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-3 py-2 focus:outline-none focus:border-red-500 resize-none"
            />
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 space-y-1">
            <p className="text-xs text-zinc-400">Season Details:</p>
            <p className="text-xs text-zinc-500">
              • Status:{" "}
              <span className="text-zinc-300">
                {season.isSynced ? "Synced from iRacing" : "Custom"}
              </span>
            </p>
            <p className="text-xs text-zinc-500">
              • Cars:{" "}
              <span className="text-zinc-300">
                {season.cars?.length ?? 0} configured
              </span>
            </p>
            <p className="text-xs text-zinc-500">
              • Created:{" "}
              <span className="text-zinc-300">
                {new Date(season.createdAt).toLocaleDateString()}
              </span>
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 rounded-lg bg-red-500 hover:bg-red-600 disabled:bg-red-600/50 transition-colors px-4 py-2 text-sm font-medium text-white"
            >
              {isSaving ? "Saving..." : "Update Season"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface CreateSeriesModalProps {
  editingSeries: Series | null;
  pointsSystems: PointsSystem[];
  onSave: (data: {
    name: string;
    description: string;
    cars: string[];
    pointsSystemId: string;
    isActive?: boolean;
  }) => Promise<void>;
  onClose: () => void;
}

function CreateSeriesModal({
  editingSeries,
  pointsSystems,
  onSave,
  onClose,
}: CreateSeriesModalProps) {
  const [name, setName] = useState(editingSeries?.name || "");
  const [description, setDescription] = useState(
    editingSeries?.description || "",
  );
  const [selectedCars, setSelectedCars] = useState<string[]>(
    editingSeries?.cars ?? [],
  );
  const [pointsSystemId, setPointsSystemId] = useState(
    editingSeries?.pointsSystem.id || "",
  );
  const [isSaving, setIsSaving] = useState(false);

  // Cars dropdown state
  const [allCars, setAllCars] = useState<string[]>([]);
  const [carsLoading, setCarsLoading] = useState(true);
  const [carsSearch, setCarsSearch] = useState("");

  useEffect(() => {
    fetch("/api/iracing/cars")
      .then((r) => r.json())
      .then((data: string[]) => setAllCars(Array.isArray(data) ? data : []))
      .catch(() => setAllCars([]))
      .finally(() => setCarsLoading(false));
  }, []);

  const filteredCars = allCars.filter((car) =>
    car.toLowerCase().includes(carsSearch.toLowerCase()),
  );

  const toggleCar = (car: string) => {
    setSelectedCars((prev) =>
      prev.includes(car) ? prev.filter((c) => c !== car) : [...prev, car],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !pointsSystemId) {
      alert("Please fill in all required fields");
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        cars: selectedCars,
        pointsSystemId,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 rounded-2xl border border-zinc-800 max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4 text-white">
          {editingSeries ? "Edit Series" : "Create New Series"}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Series Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Sprint Cup"
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-3 py-2 focus:outline-none focus:border-red-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional series description"
              rows={3}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-3 py-2 focus:outline-none focus:border-red-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-3">
              Points System *
            </label>

            {/* Preset Systems */}
            <div className="mb-4">
              <p className="text-xs text-zinc-500 mb-2">Popular Templates</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {pointsSystems
                  .filter((ps) => ps.isPreset && ps.leagueId === null)
                  .map((ps) => (
                    <button
                      key={ps.id}
                      type="button"
                      onClick={() => setPointsSystemId(ps.id)}
                      className={`p-2 rounded-lg border text-center text-xs font-medium transition-colors ${
                        pointsSystemId === ps.id
                          ? "bg-red-500/20 border-red-500 text-red-300"
                          : "bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600"
                      }`}
                    >
                      {ps.presetType === "nascar" && "🏁 NASCAR"}
                      {ps.presetType === "f1" && "🏎️ Formula 1"}
                      {ps.presetType === "indycar" && "🚗 IndyCar"}
                      {!ps.presetType && ps.name}
                    </button>
                  ))}
              </div>
            </div>

            {/* All Systems */}
            <select
              value={pointsSystemId}
              onChange={(e) => setPointsSystemId(e.target.value)}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-white px-3 py-2 focus:outline-none focus:border-red-500"
            >
              <option value="">Select a points system</option>

              <optgroup label="Presets">
                {pointsSystems
                  .filter((ps) => ps.isPreset && ps.leagueId === null)
                  .map((ps) => (
                    <option key={ps.id} value={ps.id}>
                      {ps.name}
                    </option>
                  ))}
              </optgroup>

              <optgroup label="Global Systems">
                {pointsSystems
                  .filter((ps) => !ps.isPreset && ps.leagueId === null)
                  .map((ps) => (
                    <option key={ps.id} value={ps.id}>
                      {ps.name}
                      {ps.isDefault ? " (Default)" : ""}
                    </option>
                  ))}
              </optgroup>

              <optgroup label="Custom Systems">
                {pointsSystems
                  .filter(
                    (ps) => ps.leagueId !== null && ps.leagueId !== "null",
                  )
                  .map((ps) => (
                    <option key={ps.id} value={ps.id}>
                      {ps.name}
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Cars{" "}
              {selectedCars.length > 0 && (
                <span className="text-red-400">
                  ({selectedCars.length} selected)
                </span>
              )}
            </label>

            {/* Selected cars tags */}
            {selectedCars.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedCars.map((car) => (
                  <span
                    key={car}
                    className="inline-flex items-center gap-1 text-xs bg-red-500/20 text-red-300 border border-red-500/30 rounded-full px-2 py-0.5"
                  >
                    {car}
                    <button
                      type="button"
                      onClick={() => toggleCar(car)}
                      className="hover:text-white leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Search input */}
            <input
              type="text"
              value={carsSearch}
              onChange={(e) => setCarsSearch(e.target.value)}
              placeholder="Search cars..."
              className="w-full rounded-t-lg bg-zinc-800 border border-zinc-700 text-white px-3 py-2 focus:outline-none focus:border-red-500 text-sm"
            />

            {/* Car list */}
            <div className="border border-t-0 border-zinc-700 rounded-b-lg bg-zinc-800/50 max-h-44 overflow-y-auto">
              {carsLoading ? (
                <div className="px-3 py-4 text-sm text-zinc-500 text-center">
                  Loading cars…
                </div>
              ) : filteredCars.length === 0 ? (
                <div className="px-3 py-4 text-sm text-zinc-500 text-center">
                  No cars found
                </div>
              ) : (
                filteredCars.map((car) => {
                  const selected = selectedCars.includes(car);
                  return (
                    <button
                      key={car}
                      type="button"
                      onClick={() => toggleCar(car)}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-zinc-700 transition-colors ${
                        selected
                          ? "text-red-400 bg-red-500/10"
                          : "text-zinc-300"
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center text-xs ${
                          selected
                            ? "bg-red-500 border-red-500 text-white"
                            : "border-zinc-600"
                        }`}
                      >
                        {selected && "✓"}
                      </span>
                      {car}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 rounded-lg bg-red-500 hover:bg-red-600 disabled:bg-red-600/50 transition-colors px-4 py-2 text-sm font-medium text-white"
            >
              {isSaving
                ? "Saving..."
                : editingSeries
                  ? "Update Series"
                  : "Create Series"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
