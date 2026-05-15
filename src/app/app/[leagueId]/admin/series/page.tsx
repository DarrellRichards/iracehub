"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { RaceResultsModal } from "@/components/RaceResultsModal";
import Link from "next/link";

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
  seasons: Array<{
    id: string;
    seasonName: string;
    cars?: Array<{ car_id: number }>;
    isSynced?: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
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

interface IracingTrack {
  track_id: number;
  track_name: string;
  config_name: string;
  category: string;
  retired?: boolean;
}

type RaceLengthMode = "laps" | "time";
type WeatherMode = "realistic" | "constant";
type TemperatureUnit = "F" | "C";
type WindSpeedUnit = "MPH" | "KPH";
type WindDirection = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
type SkiesOption = "Overcast" | "Partly Cloudy" | "Mostly Cloudy" | "Clear";
type PayoutPresetKey =
  | "custom"
  | "winnerTakeAll"
  | "top3"
  | "top5"
  | "top10"
  | "equalTop10"
  | "frontHeavyTop20"
  | "flatTop5WinnerBonus"
  | "podiumHeavyTop10";

interface Stage {
  stageNumber: number;
  endLap: number;
}

interface EventFormState {
  raceName: string;
  roomOpenAt: string;
  raceStartAt: string;
  isOffWeek: boolean;
  pointsCount: boolean;
  canDrop: boolean;
  registrationEnabled: boolean;
  trackId: string;
  trackName: string;
  trackConfigName: string;
  trackCategory: string;
  lengthMode: RaceLengthMode;
  lapCount: string;
  durationHours: string;
  durationMinutes: string;
  weatherMode: WeatherMode;
  skies: SkiesOption;
  temperature: string;
  temperatureUnit: TemperatureUnit;
  humidity: string;
  fog: string;
  windDirection: WindDirection;
  windSpeed: string;
  windSpeedUnit: WindSpeedUnit;
  virtualPurse: string;
  payoutPreset: PayoutPresetKey;
  virtualPayoutSplit: number[];
  hasStages: boolean;
  stages: Stage[];
}

interface SeasonEvent {
  id: string;
  raceName: string;
  eventDate: string;
  trackName?: string | null;
  trackId?: number | null;
  raceOrder: number;
  isOffWeek: boolean;
  pointsCount: boolean;
  canDrop: boolean;
  registrationEnabled: boolean;
  raceLength?: string | null;
  virtualPurse?: number | null;
  virtualPayoutSplit?: number[] | null;
  weather?: Record<string, unknown> | null;
  stages?: Stage[] | null;
}

const SKY_OPTIONS: SkiesOption[] = [
  "Overcast",
  "Partly Cloudy",
  "Mostly Cloudy",
  "Clear",
];

const WIND_DIRECTIONS: WindDirection[] = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
];

const PAYOUT_PRESETS: Array<{
  key: Exclude<PayoutPresetKey, "custom">;
  label: string;
  percentages: number[];
}> = [
  { key: "winnerTakeAll", label: "Winner Take All", percentages: [100] },
  { key: "top3", label: "Top 3", percentages: [50, 30, 20] },
  { key: "top5", label: "Top 5", percentages: [40, 25, 15, 12, 8] },
  {
    key: "top10",
    label: "Top 10",
    percentages: [25, 18, 14, 11, 9, 7, 6, 4, 3, 3],
  },
  {
    key: "equalTop10",
    label: "Equal Top 10",
    percentages: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
  },
  {
    key: "frontHeavyTop20",
    label: "Front-Heavy Top 20",
    percentages: [
      18, 14, 11, 9, 8, 7, 6, 5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.8, 1.6, 1.4,
      1.2, 1,
    ],
  },
  {
    key: "flatTop5WinnerBonus",
    label: "Flat Top 5 + Winner Bonus",
    percentages: [30, 18, 18, 17, 17],
  },
  {
    key: "podiumHeavyTop10",
    label: "Podium Heavy Top 10",
    percentages: [32, 22, 15, 9, 6, 5, 4, 3, 2, 2],
  },
];

function getPayoutPresetPercentages(preset: PayoutPresetKey): number[] {
  if (preset === "custom") return [];
  return (
    PAYOUT_PRESETS.find((option) => option.key === preset)?.percentages ?? []
  );
}

function distributePurse(purse: number, percentages: number[]): number[] {
  if (!Number.isInteger(purse) || purse <= 0 || percentages.length === 0) {
    return [];
  }

  const normalized = percentages.filter(
    (value) => Number.isFinite(value) && value > 0,
  );
  if (!normalized.length) return [];

  const base = normalized.map((percentage) =>
    Math.floor((purse * percentage) / 100),
  );
  const allocated = base.reduce((sum, amount) => sum + amount, 0);
  let remainder = purse - allocated;

  let index = 0;
  while (remainder > 0) {
    base[index] += 1;
    remainder -= 1;
    index = (index + 1) % base.length;
  }

  return base;
}

function sumPayoutSplit(split: number[]): number {
  return split.reduce(
    (total, amount) =>
      total +
      (Number.isFinite(amount) && Number(amount) > 0
        ? Math.floor(Number(amount))
        : 0),
    0,
  );
}

function normalizePayoutInput(value: string): number {
  return Math.max(0, Math.floor(parseInt(value, 10) || 0));
}

function formatConvertedNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function convertTemperatureValue(
  value: string,
  fromUnit: TemperatureUnit,
  toUnit: TemperatureUnit,
): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || fromUnit === toUnit) return value;

  if (fromUnit === "F" && toUnit === "C") {
    return formatConvertedNumber(((numeric - 32) * 5) / 9);
  }

  if (fromUnit === "C" && toUnit === "F") {
    return formatConvertedNumber((numeric * 9) / 5 + 32);
  }

  return value;
}

function convertWindSpeedValue(
  value: string,
  fromUnit: WindSpeedUnit,
  toUnit: WindSpeedUnit,
): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || fromUnit === toUnit) return value;

  if (fromUnit === "MPH" && toUnit === "KPH") {
    return formatConvertedNumber(numeric * 1.60934);
  }

  if (fromUnit === "KPH" && toUnit === "MPH") {
    return formatConvertedNumber(numeric / 1.60934);
  }

  return value;
}

function updatePayoutAmount(
  split: number[],
  index: number,
  amount: number,
): number[] {
  return split.map((current, currentIndex) =>
    currentIndex === index ? Math.max(0, amount) : current,
  );
}

function addPayoutSlot(split: number[]): number[] {
  return [...split, 0];
}

function removePayoutSlot(split: number[], index: number): number[] {
  return split.filter((_, currentIndex) => currentIndex !== index);
}

function validateStages(
  stageLapNumbers: number[],
  totalLaps: number,
): { valid: boolean; error: string | null } {
  if (stageLapNumbers.length === 0) {
    return { valid: true, error: null };
  }

  // Check that stages are in ascending order
  for (let i = 0; i < stageLapNumbers.length; i++) {
    if (stageLapNumbers[i] <= 0) {
      return {
        valid: false,
        error: `Stage ${i + 1} end lap must be a positive number`,
      };
    }

    if (i > 0 && stageLapNumbers[i] <= stageLapNumbers[i - 1]) {
      return {
        valid: false,
        error: `Stage ${i + 1} end lap must be after stage ${i} end lap (${stageLapNumbers[i - 1]})`,
      };
    }
  }

  // Check that last stage doesn't end at the same lap as race ends
  if (stageLapNumbers[stageLapNumbers.length - 1] === totalLaps) {
    return {
      valid: false,
      error: `Final stage cannot end at lap ${totalLaps} (the race end). Stages must end before the race ends.`,
    };
  }

  // Check that last stage doesn't end after race total
  if (stageLapNumbers[stageLapNumbers.length - 1] > totalLaps) {
    return {
      valid: false,
      error: `Stage ${stageLapNumbers.length} end lap (${stageLapNumbers[stageLapNumbers.length - 1]}) cannot exceed total race laps (${totalLaps})`,
    };
  }

  return { valid: true, error: null };
}

// Helper to create stages from a list of lap numbers
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function createStagesFromLaps(lapNumbers: number[]): Stage[] {
  return lapNumbers.map((endLap, index) => ({
    stageNumber: index + 1,
    endLap,
  }));
}

function createDefaultEventFormState(): EventFormState {
  return {
    raceName: "",
    roomOpenAt: "",
    raceStartAt: "",
    isOffWeek: false,
    pointsCount: true,
    canDrop: false,
    registrationEnabled: true,
    trackId: "",
    trackName: "",
    trackConfigName: "",
    trackCategory: "",
    lengthMode: "laps",
    lapCount: "",
    durationHours: "1",
    durationMinutes: "30",
    weatherMode: "realistic",
    skies: "Clear",
    temperature: "72",
    temperatureUnit: "F",
    humidity: "58",
    fog: "0",
    windDirection: "N",
    windSpeed: "5",
    windSpeedUnit: "MPH",
    virtualPurse: "0",
    payoutPreset: "custom",
    virtualPayoutSplit: [],
    hasStages: false,
    stages: [],
  };
}

function buildRaceLength(form: EventFormState): string | null {
  if (form.isOffWeek) return null;

  if (form.lengthMode === "laps") {
    const laps = parseInt(form.lapCount, 10);
    return Number.isInteger(laps) && laps > 0 ? `${laps} laps` : null;
  }

  const hours = parseInt(form.durationHours, 10) || 0;
  const minutes = parseInt(form.durationMinutes, 10) || 0;
  if (hours <= 0 && minutes <= 0) return null;

  const hourLabel = hours > 0 ? `${hours} hour${hours === 1 ? "" : "s"}` : "";
  const minuteLabel =
    minutes > 0 ? `${minutes} minute${minutes === 1 ? "" : "s"}` : "";

  return [hourLabel, minuteLabel].filter(Boolean).join(" ");
}

function buildWeatherPayload(form: EventFormState) {
  return {
    mode: form.weatherMode,
    roomOpenAt: form.roomOpenAt
      ? new Date(form.roomOpenAt).toISOString()
      : null,
    raceStartAt: form.raceStartAt
      ? new Date(form.raceStartAt).toISOString()
      : null,
    track: form.trackId
      ? {
          id: parseInt(form.trackId, 10),
          name: form.trackName,
          configName: form.trackConfigName,
          category: form.trackCategory,
        }
      : null,
    raceLength: {
      mode: form.lengthMode,
      laps:
        form.lengthMode === "laps" ? parseInt(form.lapCount, 10) || null : null,
      hours:
        form.lengthMode === "time"
          ? parseInt(form.durationHours, 10) || 0
          : null,
      minutes:
        form.lengthMode === "time"
          ? parseInt(form.durationMinutes, 10) || 0
          : null,
    },
    settings:
      form.weatherMode === "constant"
        ? {
            skies: form.skies,
            temperature: {
              value: parseInt(form.temperature, 10) || 0,
              unit: form.temperatureUnit,
            },
            humidity: parseInt(form.humidity, 10) || 0,
            fog: parseInt(form.fog, 10) || 0,
            windDirection: form.windDirection,
            windSpeed: {
              value: parseInt(form.windSpeed, 10) || 0,
              unit: form.windSpeedUnit,
            },
          }
        : null,
  };
}

function toLocalDateTimeInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function parseEventFormState(event: SeasonEvent): EventFormState {
  const defaults = createDefaultEventFormState();
  const weather =
    event.weather && typeof event.weather === "object"
      ? (event.weather as Record<string, unknown>)
      : {};
  const track =
    weather.track && typeof weather.track === "object"
      ? (weather.track as Record<string, unknown>)
      : null;
  const raceLength =
    weather.raceLength && typeof weather.raceLength === "object"
      ? (weather.raceLength as Record<string, unknown>)
      : null;
  const settings =
    weather.settings && typeof weather.settings === "object"
      ? (weather.settings as Record<string, unknown>)
      : null;
  const temperature =
    settings?.temperature && typeof settings.temperature === "object"
      ? (settings.temperature as Record<string, unknown>)
      : null;
  const windSpeed =
    settings?.windSpeed && typeof settings.windSpeed === "object"
      ? (settings.windSpeed as Record<string, unknown>)
      : null;
  const parsedPayoutSplit = Array.isArray(event.virtualPayoutSplit)
    ? event.virtualPayoutSplit
        .map((amount) =>
          Number.isFinite(amount) && Number(amount) > 0
            ? Math.floor(Number(amount))
            : 0,
        )
        .filter((amount) => amount > 0)
    : [];

  let lengthMode: RaceLengthMode = defaults.lengthMode;
  let lapCount = defaults.lapCount;
  let durationHours = defaults.durationHours;
  let durationMinutes = defaults.durationMinutes;

  if (raceLength) {
    if (raceLength.mode === "time") {
      lengthMode = "time";
      durationHours = String(Number(raceLength.hours) || 0);
      durationMinutes = String(Number(raceLength.minutes) || 0);
    } else if (raceLength.mode === "laps") {
      lengthMode = "laps";
      lapCount = String(Number(raceLength.laps) || "");
    }
  } else if (event.raceLength?.includes("lap")) {
    lengthMode = "laps";
    lapCount = String(parseInt(event.raceLength, 10) || "");
  }

  return {
    ...defaults,
    raceName: event.raceName,
    roomOpenAt: toLocalDateTimeInput(
      typeof weather.roomOpenAt === "string" ? weather.roomOpenAt : null,
    ),
    raceStartAt: toLocalDateTimeInput(
      typeof weather.raceStartAt === "string"
        ? weather.raceStartAt
        : event.eventDate,
    ),
    isOffWeek: event.isOffWeek,
    pointsCount: event.pointsCount,
    canDrop: event.canDrop,
    registrationEnabled: event.registrationEnabled,
    trackId: String(
      Number(track?.id ?? event.trackId ?? 0) > 0
        ? Number(track?.id ?? event.trackId)
        : "",
    ),
    trackName:
      typeof track?.name === "string" ? track.name : (event.trackName ?? ""),
    trackConfigName:
      typeof track?.configName === "string" ? track.configName : "",
    trackCategory: typeof track?.category === "string" ? track.category : "",
    lengthMode,
    lapCount,
    durationHours,
    durationMinutes,
    weatherMode:
      weather.mode === "constant" ? "constant" : defaults.weatherMode,
    skies:
      typeof settings?.skies === "string" &&
      SKY_OPTIONS.includes(settings.skies as SkiesOption)
        ? (settings.skies as SkiesOption)
        : defaults.skies,
    temperature:
      temperature && Number.isFinite(Number(temperature.value))
        ? String(Number(temperature.value))
        : defaults.temperature,
    temperatureUnit: temperature?.unit === "C" ? "C" : defaults.temperatureUnit,
    humidity:
      settings && Number.isFinite(Number(settings.humidity))
        ? String(Number(settings.humidity))
        : defaults.humidity,
    fog:
      settings && Number.isFinite(Number(settings.fog))
        ? String(Number(settings.fog))
        : defaults.fog,
    windDirection:
      typeof settings?.windDirection === "string" &&
      WIND_DIRECTIONS.includes(settings.windDirection as WindDirection)
        ? (settings.windDirection as WindDirection)
        : defaults.windDirection,
    windSpeed:
      windSpeed && Number.isFinite(Number(windSpeed.value))
        ? String(Number(windSpeed.value))
        : defaults.windSpeed,
    windSpeedUnit: windSpeed?.unit === "KPH" ? "KPH" : defaults.windSpeedUnit,
    virtualPurse:
      Number.isFinite(Number(event.virtualPurse)) &&
      Number(event.virtualPurse) > 0
        ? String(Math.floor(Number(event.virtualPurse)))
        : defaults.virtualPurse,
    payoutPreset: "custom",
    virtualPayoutSplit: parsedPayoutSplit,
    hasStages:
      Array.isArray(event.stages) && event.stages.length > 0 ? true : false,
    stages: Array.isArray(event.stages) ? (event.stages as Stage[]) : [],
  };
}

export default function AdminSeriesPage() {
  const { session, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const params = useParams<{ leagueId: string }>();

  const [league, setLeague] = useState<LeagueDetail | null>(null);
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pointsSystems, setPointsSystems] = useState<PointsSystem[]>([]);

  // Create Series Modal State
  const [showCreateSeriesModal, setShowCreateSeriesModal] = useState(false);
  const [createSeriesData, setCreateSeriesData] = useState({
    name: "",
    description: "",
    pointsSystemId: "",
    cars: [] as string[],
  });
  const [creatingSeriesLoading, setCreatingSeriesLoading] = useState(false);
  const [iracingCars, setIracingCars] = useState<string[]>([]);
  const [iracingCarsLoading, setIracingCarsLoading] = useState(false);
  const [createSeriesCarSearch, setCreateSeriesCarSearch] = useState("");

  // Create Season Modal State
  const [createSeasonModals, setCreateSeasonModals] = useState<
    Record<string, boolean>
  >({});
  const [createSeasonData, setCreateSeasonData] = useState<
    Record<string, { seasonName: string; description: string }>
  >({});
  const [creatingSeasonLoading, setCreatingSeasonLoading] = useState<
    Record<string, boolean>
  >({});

  // Edit Series Modal State
  const [editSeriesId, setEditSeriesId] = useState<string | null>(null);
  const [editSeriesData, setEditSeriesData] = useState({
    name: "",
    description: "",
    pointsSystemId: "",
    cars: "",
    isActive: true,
  });
  const [editingSeriesLoading, setEditingSeriesLoading] = useState(false);

  // Edit Season Modal State
  const [editSeasonId, setEditSeasonId] = useState<string | null>(null);
  const [editSeasonSeriesId, setEditSeasonSeriesId] = useState<string | null>(
    null,
  );
  const [editSeasonData, setEditSeasonData] = useState({
    seasonName: "",
    description: "",
  });
  const [editingSeasonLoading, setEditingSeasonLoading] = useState(false);

  // Add Event/Schedule Modal State
  const [addEventSeriesId, setAddEventSeriesId] = useState<string | null>(null);
  const [addEventSeasonId, setAddEventSeasonId] = useState<string | null>(null);
  const [addEventLoading, setAddEventLoading] = useState(false);
  const [addEventData, setAddEventData] = useState<EventFormState>(
    createDefaultEventFormState(),
  );
  const [tracks, setTracks] = useState<IracingTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [trackSearch, setTrackSearch] = useState("");

  // Events/Schedules State
  const [seasonEvents, setSeasonEvents] = useState<
    Record<string, SeasonEvent[]>
  >({});
  const [eventPagination, setEventPagination] = useState<
    Record<string, number>
  >({});

  // Manage Results Modal State
  const [resultsModalData, setResultsModalData] = useState<{
    seriesId: string;
    season: { id: string; seasonName: string };
  } | null>(null);

  // Edit Event Modal State
  const [editEventId, setEditEventId] = useState<string | null>(null);
  const [editEventSeriesId, setEditEventSeriesId] = useState<string | null>(
    null,
  );
  const [editEventSeasonId, setEditEventSeasonId] = useState<string | null>(
    null,
  );
  const [editEventData, setEditEventData] = useState({
    ...createDefaultEventFormState(),
  });
  const [editTrackSearch, setEditTrackSearch] = useState("");
  const [editEventLoading, setEditEventLoading] = useState(false);
  const [stageLapInputs, setStageLapInputs] = useState<Record<number, string>>(
    {},
  );
  const [editStageLapInputs, setEditStageLapInputs] = useState<
    Record<number, string>
  >({});

  useEffect(() => {
    if (!authLoading && !session?.authenticated) {
      router.replace("/");
    }
  }, [authLoading, session, router]);

  useEffect(() => {
    if (
      !session?.authenticated ||
      (!addEventSeriesId && !editEventId) ||
      tracks.length > 0
    ) {
      return;
    }

    let cancelled = false;

    async function loadTracks() {
      setTracksLoading(true);
      try {
        const res = await fetch("/api/iracing/tracks", { cache: "no-store" });
        const payload = (await res.json()) as
          | IracingTrack[]
          | { error?: string };

        if (!res.ok || !Array.isArray(payload)) {
          throw new Error(
            !Array.isArray(payload) && payload.error
              ? payload.error
              : "Failed to load tracks",
          );
        }

        if (!cancelled) {
          setTracks(payload.filter((track) => !track.retired));
        }
      } catch (err) {
        if (!cancelled) {
          alert(err instanceof Error ? err.message : "Failed to load tracks");
        }
      } finally {
        if (!cancelled) {
          setTracksLoading(false);
        }
      }
    }

    loadTracks();

    return () => {
      cancelled = true;
    };
  }, [addEventSeriesId, editEventId, session?.authenticated, tracks.length]);

  useEffect(() => {
    if (
      !session?.authenticated ||
      !showCreateSeriesModal ||
      iracingCars.length
    ) {
      return;
    }

    let cancelled = false;

    async function loadCars() {
      setIracingCarsLoading(true);
      try {
        const res = await fetch("/api/iracing/cars", { cache: "no-store" });
        const payload = (await res.json()) as string[] | { error?: string };

        if (!res.ok || !Array.isArray(payload)) {
          throw new Error(
            !Array.isArray(payload) && payload.error
              ? payload.error
              : "Failed to load cars",
          );
        }

        if (!cancelled) {
          setIracingCars(payload);
        }
      } catch (err) {
        if (!cancelled) {
          alert(err instanceof Error ? err.message : "Failed to load cars");
        }
      } finally {
        if (!cancelled) {
          setIracingCarsLoading(false);
        }
      }
    }

    void loadCars();

    return () => {
      cancelled = true;
    };
  }, [iracingCars.length, session?.authenticated, showCreateSeriesModal]);

  useEffect(() => {
    if (!session?.authenticated) return;

    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch leagues
        const leaguesRes = await fetch("/api/leagues", { cache: "no-store" });
        const leaguesData = (await leaguesRes.json()) as {
          leagues?: LeagueDetail[];
          error?: string;
        };
        if (!leaguesRes.ok)
          throw new Error(leaguesData.error ?? "fetch_failed");

        const found =
          leaguesData.leagues?.find(
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

          // Fetch series - API returns array directly
          const seriesRes = await fetch(`/api/leagues/${found.id}/series`, {
            cache: "no-store",
          });

          if (!seriesRes.ok) throw new Error("Failed to fetch series");
          const seriesData = await seriesRes.json();
          const seriesList = Array.isArray(seriesData) ? seriesData : [];

          // Fetch seasons for each series
          const seriesWithSeasons = await Promise.all(
            seriesList.map(async (serie) => {
              try {
                const seasonsRes = await fetch(
                  `/api/leagues/${found.id}/series/${serie.id}/seasons`,
                  { cache: "no-store" },
                );
                const seasons = seasonsRes.ok ? await seasonsRes.json() : [];
                return {
                  ...serie,
                  seasons: Array.isArray(seasons) ? seasons : [],
                };
              } catch {
                return { ...serie, seasons: [] };
              }
            }),
          );

          setSeries(seriesWithSeasons);

          // Fetch events for each season
          const eventsMap: Record<string, SeasonEvent[]> = {};

          for (const serie of seriesWithSeasons) {
            for (const season of serie.seasons) {
              try {
                const eventsRes = await fetch(
                  `/api/leagues/${found.id}/series/${serie.id}/seasons/${season.id}/schedules`,
                  { cache: "no-store" },
                );
                if (eventsRes.ok) {
                  const eventsData = await eventsRes.json();
                  eventsMap[season.id] = Array.isArray(eventsData)
                    ? eventsData
                    : [];
                }
              } catch {
                eventsMap[season.id] = [];
              }
            }
          }

          setSeasonEvents(eventsMap);
          setEventPagination({});

          // Fetch points systems - API returns array directly
          const psRes = await fetch(`/api/leagues/${found.id}/points-systems`, {
            cache: "no-store",
          });
          if (psRes.ok) {
            const psData = await psRes.json();
            const systemsList = Array.isArray(psData) ? psData : [];
            setPointsSystems(systemsList);
            if (systemsList.length) {
              setCreateSeriesData((prev) => ({
                ...prev,
                pointsSystemId: systemsList[0].id,
              }));
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "unknown_error");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [session?.authenticated, params.leagueId]);

  const refetchData = useCallback(async () => {
    if (!league) return;

    setLoading(true);
    try {
      // Fetch series - API returns array directly
      const seriesRes = await fetch(`/api/leagues/${league.id}/series`, {
        cache: "no-store",
      });

      if (!seriesRes.ok) throw new Error("Failed to fetch series");
      const seriesData = await seriesRes.json();
      const seriesList = Array.isArray(seriesData) ? seriesData : [];

      // Fetch seasons for each series
      const seriesWithSeasons = await Promise.all(
        seriesList.map(async (serie) => {
          try {
            const seasonsRes = await fetch(
              `/api/leagues/${league.id}/series/${serie.id}/seasons`,
              { cache: "no-store" },
            );
            const seasons = seasonsRes.ok ? await seasonsRes.json() : [];
            return {
              ...serie,
              seasons: Array.isArray(seasons) ? seasons : [],
            };
          } catch {
            return { ...serie, seasons: [] };
          }
        }),
      );

      setSeries(seriesWithSeasons);

      // Fetch events for each season
      const eventsMap: Record<string, SeasonEvent[]> = {};

      for (const serie of seriesWithSeasons) {
        for (const season of serie.seasons) {
          try {
            const eventsRes = await fetch(
              `/api/leagues/${league.id}/series/${serie.id}/seasons/${season.id}/schedules`,
              { cache: "no-store" },
            );
            if (eventsRes.ok) {
              const eventsData = await eventsRes.json();
              eventsMap[season.id] = Array.isArray(eventsData)
                ? eventsData
                : [];
            }
          } catch {
            eventsMap[season.id] = [];
          }
        }
      }

      setSeasonEvents(eventsMap);
      setEventPagination({});
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to refresh data");
    } finally {
      setLoading(false);
    }
  }, [league]);

  const handleCreateSeriesClick = () => {
    setCreateSeriesData({
      name: "",
      description: "",
      pointsSystemId: pointsSystems[0]?.id || "",
      cars: [],
    });
    setCreateSeriesCarSearch("");
    setShowCreateSeriesModal(true);
  };

  const handleCreateSeries = async () => {
    if (!createSeriesData.name.trim()) {
      alert("Please enter a series name");
      return;
    }
    if (!createSeriesData.pointsSystemId) {
      alert("Please select a points system");
      return;
    }
    if (!league) return;

    try {
      setCreatingSeriesLoading(true);
      const carList = createSeriesData.cars;

      const res = await fetch(`/api/leagues/${league.id}/series`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createSeriesData.name,
          description: createSeriesData.description || null,
          pointsSystemId: createSeriesData.pointsSystemId,
          cars: carList,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to create series");
      }

      setShowCreateSeriesModal(false);
      setCreateSeriesData({
        name: "",
        description: "",
        pointsSystemId: pointsSystems[0]?.id || "",
        cars: [],
      });
      setCreateSeriesCarSearch("");
      await refetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error creating series");
    } finally {
      setCreatingSeriesLoading(false);
    }
  };

  const handleCreateSeasonClick = (seriesId: string) => {
    setCreateSeasonModals((prev) => ({ ...prev, [seriesId]: true }));
    setCreateSeasonData((prev) => ({
      ...prev,
      [seriesId]: { seasonName: "", description: "" },
    }));
  };

  const handleCreateSeason = async (seriesId: string) => {
    const seasonData = createSeasonData[seriesId];
    if (!seasonData?.seasonName.trim()) {
      alert("Please enter a season name");
      return;
    }
    if (!league) return;

    try {
      setCreatingSeasonLoading((prev) => ({ ...prev, [seriesId]: true }));
      const res = await fetch(
        `/api/leagues/${league.id}/series/${seriesId}/seasons`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seasonName: seasonData.seasonName,
            description: seasonData.description || null,
          }),
        },
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to create season");
      }

      setCreateSeasonModals((prev) => ({ ...prev, [seriesId]: false }));
      setCreateSeasonData((prev) => ({
        ...prev,
        [seriesId]: { seasonName: "", description: "" },
      }));
      await refetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error creating season");
    } finally {
      setCreatingSeasonLoading((prev) => ({ ...prev, [seriesId]: false }));
    }
  };

  const handleDeleteSeason = async (seriesId: string, seasonId: string) => {
    const seriesObj = series.find((s) => s.id === seriesId);
    const seasonObj = (
      seriesObj?.seasons as
        | Array<{ id: string; seasonName: string }>
        | undefined
    )?.find((se) => se.id === seasonId);
    if (!seasonObj) return;
    if (!league) return;

    if (
      !confirm(
        `Delete season "${seasonObj.seasonName}"? This cannot be undone.`,
      )
    ) {
      return;
    }

    try {
      const res = await fetch(
        `/api/leagues/${league.id}/series/${seriesId}/seasons/${seasonId}`,
        { method: "DELETE" },
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to delete season");
      }

      await refetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error deleting season");
    }
  };

  const handleEditSeriesClick = (s: Series) => {
    setEditSeriesId(s.id);
    setEditSeriesData({
      name: s.name,
      description: s.description || "",
      pointsSystemId: s.pointsSystem.id,
      cars: s.cars.join(", "),
      isActive: s.isActive,
    });
  };

  const handleUpdateSeries = async () => {
    if (!editSeriesData.name.trim()) {
      alert("Please enter a series name");
      return;
    }
    if (!editSeriesId || !league) return;

    try {
      setEditingSeriesLoading(true);
      const carList = editSeriesData.cars
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);

      const res = await fetch(
        `/api/leagues/${league.id}/series/${editSeriesId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editSeriesData.name,
            description: editSeriesData.description || null,
            pointsSystemId: editSeriesData.pointsSystemId,
            cars: carList,
            isActive: editSeriesData.isActive,
          }),
        },
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to update series");
      }

      setEditSeriesId(null);
      await refetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error updating series");
    } finally {
      setEditingSeriesLoading(false);
    }
  };

  const handleRetireSeries = async (seriesId: string) => {
    if (!league) return;
    if (!confirm("Retire this series? You can re-activate it later.")) return;

    try {
      const res = await fetch(`/api/leagues/${league.id}/series/${seriesId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to retire series");
      }

      await refetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error retiring series");
    }
  };

  const handleEditSeasonClick = (
    seriesId: string,
    season: {
      id: string;
      seasonName: string;
      description?: string | null;
    },
  ) => {
    setEditSeasonSeriesId(seriesId);
    setEditSeasonId(season.id);
    setEditSeasonData({
      seasonName: season.seasonName,
      description: season.description || "",
    });
  };

  const handleUpdateSeason = async () => {
    if (!editSeasonData.seasonName.trim()) {
      alert("Please enter a season name");
      return;
    }
    if (!editSeasonId || !editSeasonSeriesId || !league) return;

    try {
      setEditingSeasonLoading(true);
      const res = await fetch(
        `/api/leagues/${league.id}/series/${editSeasonSeriesId}/seasons/${editSeasonId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seasonName: editSeasonData.seasonName,
            description: editSeasonData.description || null,
          }),
        },
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to update season");
      }

      setEditSeasonId(null);
      setEditSeasonSeriesId(null);
      await refetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error updating season");
    } finally {
      setEditingSeasonLoading(false);
    }
  };

  const handleAddEventClick = (seriesId: string, seasonId: string) => {
    setAddEventSeriesId(seriesId);
    setAddEventSeasonId(seasonId);
    setAddEventData(createDefaultEventFormState());
    setTrackSearch("");
  };

  const toggleCreateSeriesCar = (carName: string) => {
    setCreateSeriesData((prev) => {
      const exists = prev.cars.includes(carName);
      return {
        ...prev,
        cars: exists
          ? prev.cars.filter((name) => name !== carName)
          : [...prev.cars, carName],
      };
    });
  };

  const handleManageResults = (
    seriesId: string,
    season: { id: string; seasonName: string },
  ) => {
    setResultsModalData({ seriesId, season });
  };

  const applyAddEventPayoutPreset = (preset: PayoutPresetKey) => {
    setAddEventData((prev) => {
      const purse = Math.max(0, parseInt(prev.virtualPurse, 10) || 0);
      return {
        ...prev,
        payoutPreset: preset,
        virtualPayoutSplit:
          preset === "custom"
            ? prev.virtualPayoutSplit
            : distributePurse(purse, getPayoutPresetPercentages(preset)),
      };
    });
  };

  const applyEditEventPayoutPreset = (preset: PayoutPresetKey) => {
    setEditEventData((prev) => {
      const purse = Math.max(0, parseInt(prev.virtualPurse, 10) || 0);
      return {
        ...prev,
        payoutPreset: preset,
        virtualPayoutSplit:
          preset === "custom"
            ? prev.virtualPayoutSplit
            : distributePurse(purse, getPayoutPresetPercentages(preset)),
      };
    });
  };

  const rebalanceAddEventPayouts = () => {
    setAddEventData((prev) => {
      const purse = Math.max(0, parseInt(prev.virtualPurse, 10) || 0);
      const paidPositions = prev.virtualPayoutSplit.filter(
        (amount) => amount > 0,
      ).length;
      const slotCount = Math.max(
        paidPositions,
        prev.virtualPayoutSplit.length,
        1,
      );
      const percentages = Array.from(
        { length: slotCount },
        () => 100 / slotCount,
      );
      return {
        ...prev,
        payoutPreset: "custom",
        virtualPayoutSplit: distributePurse(purse, percentages),
      };
    });
  };

  const rebalanceEditEventPayouts = () => {
    setEditEventData((prev) => {
      const purse = Math.max(0, parseInt(prev.virtualPurse, 10) || 0);
      const paidPositions = prev.virtualPayoutSplit.filter(
        (amount) => amount > 0,
      ).length;
      const slotCount = Math.max(
        paidPositions,
        prev.virtualPayoutSplit.length,
        1,
      );
      const percentages = Array.from(
        { length: slotCount },
        () => 100 / slotCount,
      );
      return {
        ...prev,
        payoutPreset: "custom",
        virtualPayoutSplit: distributePurse(purse, percentages),
      };
    });
  };

  const handleEditEventClick = (
    seriesId: string,
    seasonId: string,
    event: SeasonEvent,
  ) => {
    setEditEventId(event.id);
    setEditEventSeriesId(seriesId);
    setEditEventSeasonId(seasonId);
    const parsed = parseEventFormState(event);
    setEditEventData(parsed);
    setEditTrackSearch(
      parsed.trackName
        ? [parsed.trackName, parsed.trackConfigName].filter(Boolean).join(" · ")
        : "",
    );
  };

  const handleUpdateEvent = async () => {
    if (!editEventData.raceName.trim()) {
      alert("Please enter a race name");
      return;
    }
    if (!editEventData.roomOpenAt) {
      alert("Please select a room open time");
      return;
    }
    if (!editEventData.raceStartAt) {
      alert("Please select a race start time");
      return;
    }
    if (
      new Date(editEventData.roomOpenAt).getTime() >
      new Date(editEventData.raceStartAt).getTime()
    ) {
      alert("Room open time must be before race start time");
      return;
    }
    if (!editEventData.isOffWeek && !editEventData.trackId) {
      alert("Please select an iRacing track");
      return;
    }
    if (!editEventData.isOffWeek && !buildRaceLength(editEventData)) {
      alert("Please provide a race length");
      return;
    }

    // Validate stages if enabled
    if (editEventData.hasStages && editEventData.lengthMode === "laps") {
      const totalLaps = parseInt(editEventData.lapCount, 10);
      const stageLaps = editEventData.stages.map((s) => s.endLap);
      const stageValidation = validateStages(stageLaps, totalLaps);
      if (!stageValidation.valid) {
        alert(stageValidation.error);
        return;
      }
    }

    const editPurse = Math.max(
      0,
      parseInt(editEventData.virtualPurse, 10) || 0,
    );
    const editPayoutTotal = sumPayoutSplit(editEventData.virtualPayoutSplit);
    if (
      !editEventData.isOffWeek &&
      editPurse > 0 &&
      editPayoutTotal !== editPurse
    ) {
      alert("Payout split must equal the race purse total");
      return;
    }
    if (!editEventId || !editEventSeriesId || !editEventSeasonId || !league)
      return;

    try {
      setEditEventLoading(true);
      const res = await fetch(
        `/api/leagues/${league.id}/series/${editEventSeriesId}/seasons/${editEventSeasonId}/schedules/${editEventId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            raceName: editEventData.raceName,
            roomOpenAt: new Date(editEventData.roomOpenAt).toISOString(),
            eventDate: editEventData.raceStartAt
              ? new Date(editEventData.raceStartAt).toISOString()
              : undefined,
            trackId: editEventData.trackId
              ? parseInt(editEventData.trackId, 10)
              : undefined,
            trackName: editEventData.trackName || null,
            trackConfigName: editEventData.trackConfigName || null,
            trackCategory: editEventData.trackCategory || null,
            isOffWeek: editEventData.isOffWeek,
            pointsCount: editEventData.pointsCount,
            canDrop: editEventData.canDrop,
            registrationEnabled: editEventData.registrationEnabled,
            raceLength: buildRaceLength(editEventData),
            virtualPurse: editEventData.isOffWeek ? 0 : editPurse,
            virtualPayoutSplit: editEventData.isOffWeek
              ? []
              : editEventData.virtualPayoutSplit,
            weather: buildWeatherPayload(editEventData),
            stages: editEventData.hasStages ? editEventData.stages : [],
          }),
        },
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to update event");
      }

      setEditEventId(null);
      setEditEventSeriesId(null);
      setEditEventSeasonId(null);
      setEditEventData(createDefaultEventFormState());
      setEditTrackSearch("");
      await refetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error updating event");
    } finally {
      setEditEventLoading(false);
    }
  };

  const handleCreateEvent = async () => {
    if (!addEventData.raceName.trim()) {
      alert("Please enter a race name");
      return;
    }
    if (!addEventData.roomOpenAt) {
      alert("Please select a room open time");
      return;
    }
    if (!addEventData.raceStartAt) {
      alert("Please select a race start time");
      return;
    }
    if (
      new Date(addEventData.roomOpenAt).getTime() >
      new Date(addEventData.raceStartAt).getTime()
    ) {
      alert("Room open time must be before race start time");
      return;
    }
    if (!addEventData.isOffWeek && !addEventData.trackId) {
      alert("Please select an iRacing track");
      return;
    }
    if (!addEventData.isOffWeek && !buildRaceLength(addEventData)) {
      alert("Please provide a race length");
      return;
    }

    // Validate stages if enabled
    if (addEventData.hasStages && addEventData.lengthMode === "laps") {
      const totalLaps = parseInt(addEventData.lapCount, 10);
      const stageLaps = addEventData.stages.map((s) => s.endLap);
      const stageValidation = validateStages(stageLaps, totalLaps);
      if (!stageValidation.valid) {
        alert(stageValidation.error);
        return;
      }
    }

    const addPurse = Math.max(0, parseInt(addEventData.virtualPurse, 10) || 0);
    const addPayoutTotal = sumPayoutSplit(addEventData.virtualPayoutSplit);
    if (
      !addEventData.isOffWeek &&
      addPurse > 0 &&
      addPayoutTotal !== addPurse
    ) {
      alert("Payout split must equal the race purse total");
      return;
    }
    if (!addEventSeriesId || !addEventSeasonId || !league) return;

    try {
      setAddEventLoading(true);
      const res = await fetch(
        `/api/leagues/${league.id}/series/${addEventSeriesId}/seasons/${addEventSeasonId}/schedules`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            raceName: addEventData.raceName,
            roomOpenAt: new Date(addEventData.roomOpenAt).toISOString(),
            eventDate: new Date(addEventData.raceStartAt).toISOString(),
            trackId: addEventData.trackId
              ? parseInt(addEventData.trackId, 10)
              : undefined,
            trackName: addEventData.trackName,
            trackConfigName: addEventData.trackConfigName,
            trackCategory: addEventData.trackCategory,
            isOffWeek: addEventData.isOffWeek,
            pointsCount: addEventData.pointsCount,
            canDrop: addEventData.canDrop,
            registrationEnabled: addEventData.registrationEnabled,
            raceLength: buildRaceLength(addEventData),
            virtualPurse: addEventData.isOffWeek ? 0 : addPurse,
            virtualPayoutSplit: addEventData.isOffWeek
              ? []
              : addEventData.virtualPayoutSplit,
            weather: buildWeatherPayload(addEventData),
            stages: addEventData.hasStages ? addEventData.stages : [],
          }),
        },
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to create event");
      }

      setAddEventSeriesId(null);
      setAddEventSeasonId(null);
      setAddEventData(createDefaultEventFormState());
      setTrackSearch("");
      await refetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error creating event");
    } finally {
      setAddEventLoading(false);
    }
  };

  const filteredCreateSeriesCars = iracingCars.filter((carName) => {
    const query = createSeriesCarSearch.trim().toLowerCase();
    if (!query) return true;
    return carName.toLowerCase().includes(query);
  });

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
            <p className="text-xs text-zinc-500 mb-1">
              Admin Panel / Series & Seasons
            </p>
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
          <div>
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold mb-2">Series & Seasons</h2>
                <p className="text-zinc-400">
                  Manage racing series and seasons for your league
                </p>
              </div>
              <button
                onClick={handleCreateSeriesClick}
                className="rounded-lg bg-red-500 hover:bg-red-600 transition-colors px-4 py-2 text-sm font-medium text-white"
              >
                + Create Series
              </button>
            </div>

            {series.length === 0 ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-12 text-center">
                <p className="text-zinc-400 text-sm mb-4">
                  No series created yet. Start by creating your first series.
                </p>
                <button
                  onClick={handleCreateSeriesClick}
                  className="text-red-400 hover:text-red-300 text-sm font-medium"
                >
                  Create your first series →
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {series.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-bold text-lg">{s.name}</h3>
                          {s.isActive ? (
                            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/30">
                              Active
                            </span>
                          ) : (
                            <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold bg-zinc-700/50 text-zinc-400 border border-zinc-600">
                              Retired
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
                        <button
                          onClick={() => handleEditSeriesClick(s)}
                          className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white text-sm transition-colors"
                        >
                          Edit
                        </button>
                        {s.isActive && (
                          <button
                            onClick={() => handleRetireSeries(s.id)}
                            className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:border-red-500/50 hover:text-red-400 text-sm transition-colors"
                          >
                            Retire
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-sm mb-6 pb-6 border-b border-zinc-800">
                      <div>
                        <span className="text-zinc-500 text-xs uppercase tracking-wider">
                          Cars
                        </span>
                        <p className="text-zinc-200 mt-1.5">
                          {s.cars.length > 0
                            ? `${s.cars.length} car${s.cars.length !== 1 ? "s" : ""}`
                            : "None"}
                        </p>
                      </div>
                      <div>
                        <span className="text-zinc-500 text-xs uppercase tracking-wider">
                          Points System
                        </span>
                        <p className="text-zinc-200 mt-1.5">
                          {s.pointsSystem.name}
                        </p>
                      </div>
                      <div>
                        <span className="text-zinc-500 text-xs uppercase tracking-wider">
                          Seasons
                        </span>
                        <p className="text-zinc-200 mt-1.5">
                          {s.seasons.length}
                        </p>
                      </div>
                    </div>

                    {/* Seasons List */}
                    <div>
                      <h4 className="font-semibold text-sm mb-3 flex items-center justify-between">
                        <span>Seasons ({s.seasons.length})</span>
                        <button
                          onClick={() => handleCreateSeasonClick(s.id)}
                          className="text-xs px-2.5 py-1 rounded bg-red-500 hover:bg-red-600 text-white transition-colors"
                        >
                          + Add Season
                        </button>
                      </h4>

                      {s.seasons.length === 0 ? (
                        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 text-center text-xs text-zinc-500">
                          No seasons yet. Create a custom season or sync from
                          iRacing.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {s.seasons.map((season) => {
                            const events = seasonEvents[season.id] || [];
                            const pageNumber = eventPagination[season.id] || 0;
                            const pageSize = 10;
                            const totalPages = Math.ceil(
                              events.length / pageSize,
                            );
                            const paginatedEvents = events.slice(
                              pageNumber * pageSize,
                              (pageNumber + 1) * pageSize,
                            );
                            const startIndex = pageNumber * pageSize + 1;
                            const endIndex = Math.min(
                              (pageNumber + 1) * pageSize,
                              events.length,
                            );

                            return (
                              <div key={season.id}>
                                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-3 hover:border-zinc-700 transition-colors flex items-start justify-between">
                                  <div className="flex-1">
                                    <p className="font-medium text-sm">
                                      {season.seasonName}
                                    </p>
                                    <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
                                      <span>
                                        {season.cars?.length ?? 0} cars
                                      </span>
                                      {season.isSynced && (
                                        <>
                                          <span>•</span>
                                          <span className="bg-blue-500/10 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded">
                                            Synced
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() =>
                                        handleEditSeasonClick(s.id, season)
                                      }
                                      className="text-xs px-2.5 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleAddEventClick(s.id, season.id)
                                      }
                                      className="text-xs px-2.5 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-blue-500/50 hover:text-blue-400 transition-colors"
                                    >
                                      + Event
                                    </button>
                                    <button
                                      onClick={() =>
                                        handleDeleteSeason(s.id, season.id)
                                      }
                                      className="text-xs px-2.5 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-red-500/50 hover:text-red-400 transition-colors"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>

                                {/* Events List with Pagination */}
                                {events.length > 0 && (
                                  <div className="ml-2 mt-2 rounded-lg border border-zinc-800/50 bg-zinc-950/30 p-3">
                                    <div className="space-y-2">
                                      {paginatedEvents.map((event) => (
                                        <div
                                          key={event.id}
                                          className="rounded border border-zinc-800/50 bg-zinc-950/40 px-3 py-2 flex items-center justify-between hover:border-zinc-700 transition-colors"
                                        >
                                          <div className="flex-1">
                                            <p className="text-xs font-medium text-white">
                                              {event.raceName}
                                              {event.isOffWeek && (
                                                <span className="ml-1.5 text-[10px] font-semibold uppercase border border-zinc-600/50 text-zinc-500 px-1 rounded">
                                                  Off Week
                                                </span>
                                              )}
                                            </p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                              {event.raceOrder > 0 && (
                                                <span className="text-xs text-zinc-500">
                                                  Race {event.raceOrder}
                                                </span>
                                              )}
                                              {event.trackName && (
                                                <span className="text-xs text-zinc-500">
                                                  · {event.trackName}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0 ml-3">
                                            <span className="text-xs text-zinc-400">
                                              {event.eventDate &&
                                                new Date(
                                                  event.eventDate,
                                                ).toLocaleDateString()}
                                            </span>
                                            <button
                                              onClick={() =>
                                                handleEditEventClick(
                                                  s.id,
                                                  season.id,
                                                  event,
                                                )
                                              }
                                              className="text-[11px] px-2 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white transition-colors"
                                            >
                                              Edit Event
                                            </button>
                                            <button
                                              onClick={() =>
                                                handleManageResults(s.id, {
                                                  id: season.id,
                                                  seasonName: season.seasonName,
                                                })
                                              }
                                              className="text-[11px] px-2 py-0.5 rounded border border-blue-700/50 text-blue-400 hover:border-blue-500 hover:text-blue-300 transition-colors"
                                            >
                                              Results
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>

                                    {/* Pagination Controls */}
                                    {totalPages > 1 && (
                                      <div className="mt-3 flex items-center justify-between border-t border-zinc-800/50 pt-3">
                                        <button
                                          onClick={() =>
                                            setEventPagination((prev) => ({
                                              ...prev,
                                              [season.id]: Math.max(
                                                0,
                                                (prev[season.id] || 0) - 1,
                                              ),
                                            }))
                                          }
                                          disabled={pageNumber === 0}
                                          className="text-xs px-2.5 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                          ← Prev
                                        </button>
                                        <span className="text-xs text-zinc-400">
                                          {startIndex}-{endIndex} of{" "}
                                          {events.length}
                                          {" | "}
                                          Page {pageNumber + 1} of {totalPages}
                                        </span>
                                        <button
                                          onClick={() =>
                                            setEventPagination((prev) => ({
                                              ...prev,
                                              [season.id]:
                                                (prev[season.id] || 0) + 1,
                                            }))
                                          }
                                          disabled={
                                            pageNumber >= totalPages - 1
                                          }
                                          className="text-xs px-2.5 py-1 rounded border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                          Next →
                                        </button>
                                      </div>
                                    )}

                                    {events.length === 0 && (
                                      <div className="text-center text-xs text-zinc-500 py-2">
                                        No events yet
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Create Series Modal */}
      {showCreateSeriesModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h2 className="mb-6 text-xl font-bold text-white">
              Create New Series
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Series Name *
                </label>
                <input
                  type="text"
                  value={createSeriesData.name}
                  onChange={(e) =>
                    setCreateSeriesData((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
                  placeholder="e.g., 2024 Ferrari Cup"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Description
                </label>
                <textarea
                  value={createSeriesData.description}
                  onChange={(e) =>
                    setCreateSeriesData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
                  placeholder="Optional description"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Points System *
                </label>
                <select
                  value={createSeriesData.pointsSystemId}
                  onChange={(e) =>
                    setCreateSeriesData((prev) => ({
                      ...prev,
                      pointsSystemId: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                >
                  {pointsSystems.map((ps) => (
                    <option key={ps.id} value={ps.id}>
                      {ps.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Cars
                </label>
                <input
                  type="text"
                  value={createSeriesCarSearch}
                  onChange={(e) => setCreateSeriesCarSearch(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
                  placeholder="Search iRacing cars"
                />
                <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/50">
                  {iracingCarsLoading ? (
                    <div className="px-3 py-3 text-sm text-zinc-500">
                      Loading cars...
                    </div>
                  ) : filteredCreateSeriesCars.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-zinc-500">
                      No cars found
                    </div>
                  ) : (
                    filteredCreateSeriesCars.map((carName) => {
                      const selected = createSeriesData.cars.includes(carName);
                      return (
                        <button
                          key={carName}
                          type="button"
                          onClick={() => toggleCreateSeriesCar(carName)}
                          className={`flex w-full items-center justify-between border-b border-zinc-800 px-3 py-2 text-left text-sm transition-colors last:border-b-0 ${
                            selected
                              ? "bg-red-500/10 text-white"
                              : "text-zinc-300 hover:bg-zinc-900"
                          }`}
                        >
                          <span>{carName}</span>
                          <span className="text-xs text-zinc-500">
                            {selected ? "Selected" : "Select"}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
                {createSeriesData.cars.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {createSeriesData.cars.map((carName) => (
                      <button
                        key={carName}
                        type="button"
                        onClick={() => toggleCreateSeriesCar(carName)}
                        className="rounded-full border border-red-700/60 bg-red-500/10 px-2 py-1 text-xs text-red-300 hover:border-red-500"
                      >
                        {carName} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={handleCreateSeries}
                disabled={creatingSeriesLoading}
                className="flex-1 rounded-lg bg-red-500 hover:bg-red-600 disabled:bg-zinc-700 disabled:text-zinc-500 px-4 py-2 text-sm font-medium text-white transition-colors"
              >
                {creatingSeriesLoading ? "Creating..." : "Create Series"}
              </button>
              <button
                onClick={() => setShowCreateSeriesModal(false)}
                className="flex-1 rounded-lg border border-zinc-700 hover:border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Season Modals */}
      {Object.entries(createSeasonModals).map(
        ([seriesId, isOpen]) =>
          isOpen && (
            <div
              key={seriesId}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            >
              <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
                <h2 className="mb-6 text-xl font-bold text-white">
                  Add Season to {series.find((s) => s.id === seriesId)?.name}
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Season Name *
                    </label>
                    <input
                      type="text"
                      value={createSeasonData[seriesId]?.seasonName || ""}
                      onChange={(e) =>
                        setCreateSeasonData((prev) => ({
                          ...prev,
                          [seriesId]: {
                            ...prev[seriesId],
                            seasonName: e.target.value,
                          },
                        }))
                      }
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
                      placeholder="e.g., Spring 2024"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Description
                    </label>
                    <textarea
                      value={createSeasonData[seriesId]?.description || ""}
                      onChange={(e) =>
                        setCreateSeasonData((prev) => ({
                          ...prev,
                          [seriesId]: {
                            ...prev[seriesId],
                            description: e.target.value,
                          },
                        }))
                      }
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
                      placeholder="Optional description"
                      rows={2}
                    />
                  </div>
                </div>
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => handleCreateSeason(seriesId)}
                    disabled={creatingSeasonLoading[seriesId]}
                    className="flex-1 rounded-lg bg-red-500 hover:bg-red-600 disabled:bg-zinc-700 disabled:text-zinc-500 px-4 py-2 text-sm font-medium text-white transition-colors"
                  >
                    {creatingSeasonLoading[seriesId]
                      ? "Adding..."
                      : "Add Season"}
                  </button>
                  <button
                    onClick={() =>
                      setCreateSeasonModals((prev) => ({
                        ...prev,
                        [seriesId]: false,
                      }))
                    }
                    className="flex-1 rounded-lg border border-zinc-700 hover:border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ),
      )}

      {/* Edit Series Modal */}
      {editSeriesId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h2 className="mb-6 text-xl font-bold text-white">Edit Series</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Series Name *
                </label>
                <input
                  type="text"
                  value={editSeriesData.name}
                  onChange={(e) =>
                    setEditSeriesData((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
                  placeholder="Series name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Description
                </label>
                <textarea
                  value={editSeriesData.description}
                  onChange={(e) =>
                    setEditSeriesData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
                  placeholder="Optional description"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Cars (comma-separated)
                </label>
                <input
                  type="text"
                  value={editSeriesData.cars}
                  onChange={(e) =>
                    setEditSeriesData((prev) => ({
                      ...prev,
                      cars: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
                  placeholder="Car names"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={editSeriesData.isActive}
                  onChange={(e) =>
                    setEditSeriesData((prev) => ({
                      ...prev,
                      isActive: e.target.checked,
                    }))
                  }
                  className="rounded"
                />
                <label htmlFor="isActive" className="text-sm text-zinc-300">
                  Active
                </label>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={handleUpdateSeries}
                disabled={editingSeriesLoading}
                className="flex-1 rounded-lg bg-red-500 hover:bg-red-600 disabled:bg-zinc-700 disabled:text-zinc-500 px-4 py-2 text-sm font-medium text-white transition-colors"
              >
                {editingSeriesLoading ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={() => setEditSeriesId(null)}
                className="flex-1 rounded-lg border border-zinc-700 hover:border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Season Modal */}
      {editSeasonId && editSeasonSeriesId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h2 className="mb-6 text-xl font-bold text-white">Edit Season</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Season Name *
                </label>
                <input
                  type="text"
                  value={editSeasonData.seasonName}
                  onChange={(e) =>
                    setEditSeasonData((prev) => ({
                      ...prev,
                      seasonName: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
                  placeholder="Season name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Description
                </label>
                <textarea
                  value={editSeasonData.description}
                  onChange={(e) =>
                    setEditSeasonData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
                  placeholder="Optional description"
                  rows={2}
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={handleUpdateSeason}
                disabled={editingSeasonLoading}
                className="flex-1 rounded-lg bg-red-500 hover:bg-red-600 disabled:bg-zinc-700 disabled:text-zinc-500 px-4 py-2 text-sm font-medium text-white transition-colors"
              >
                {editingSeasonLoading ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={() => {
                  setEditSeasonId(null);
                  setEditSeasonSeriesId(null);
                }}
                className="flex-1 rounded-lg border border-zinc-700 hover:border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Event/Schedule Modal */}
      {addEventSeriesId && addEventSeasonId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h2 className="mb-6 text-xl font-bold text-white">Add Event</h2>
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Event Name *
                  </label>
                  <input
                    type="text"
                    value={addEventData.raceName}
                    onChange={(e) =>
                      setAddEventData((prev) => ({
                        ...prev,
                        raceName: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
                    placeholder="e.g., Week 5 - Daytona 250"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Room Opens *
                    </label>
                    <input
                      type="datetime-local"
                      value={addEventData.roomOpenAt}
                      onChange={(e) =>
                        setAddEventData((prev) => ({
                          ...prev,
                          roomOpenAt: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Race Starts *
                    </label>
                    <input
                      type="datetime-local"
                      value={addEventData.raceStartAt}
                      onChange={(e) =>
                        setAddEventData((prev) => ({
                          ...prev,
                          raceStartAt: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addEventData.isOffWeek}
                      onChange={(e) =>
                        setAddEventData((prev) => ({
                          ...prev,
                          isOffWeek: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded border-zinc-600"
                    />
                    <span className="text-sm text-zinc-300">Off Week</span>
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addEventData.pointsCount}
                      onChange={(e) =>
                        setAddEventData((prev) => ({
                          ...prev,
                          pointsCount: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded border-zinc-600"
                    />
                    <span className="text-sm text-zinc-300">Points Race</span>
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addEventData.canDrop}
                      onChange={(e) =>
                        setAddEventData((prev) => ({
                          ...prev,
                          canDrop: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded border-zinc-600"
                    />
                    <span className="text-sm text-zinc-300">
                      Week Can Be Dropped
                    </span>
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={addEventData.registrationEnabled}
                      onChange={(e) =>
                        setAddEventData((prev) => ({
                          ...prev,
                          registrationEnabled: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded border-zinc-600"
                    />
                    <span className="text-sm text-zinc-300">
                      Registration Enabled
                    </span>
                  </label>
                </div>

                {!addEventData.isOffWeek && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">
                        iRacing Track *
                      </label>
                      <input
                        type="text"
                        value={trackSearch}
                        onChange={(e) => setTrackSearch(e.target.value)}
                        placeholder="Search tracks or configs"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
                      />
                      <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/50">
                        {tracksLoading ? (
                          <div className="px-3 py-4 text-sm text-zinc-500">
                            Loading tracks...
                          </div>
                        ) : (
                          tracks
                            .filter((track) => {
                              const query = trackSearch.trim().toLowerCase();
                              if (!query) return true;
                              return [
                                track.track_name,
                                track.config_name,
                                track.category,
                              ]
                                .join(" ")
                                .toLowerCase()
                                .includes(query);
                            })
                            .slice(0, 12)
                            .map((track) => {
                              const selected =
                                addEventData.trackId ===
                                  String(track.track_id) &&
                                addEventData.trackConfigName ===
                                  track.config_name;
                              return (
                                <button
                                  key={`${track.track_id}-${track.config_name}`}
                                  type="button"
                                  onClick={() => {
                                    setAddEventData((prev) => ({
                                      ...prev,
                                      trackId: String(track.track_id),
                                      trackName: track.track_name,
                                      trackConfigName: track.config_name,
                                      trackCategory: track.category,
                                    }));
                                    setTrackSearch(
                                      `${track.track_name} · ${track.config_name}`,
                                    );
                                  }}
                                  className={`w-full border-b border-zinc-800 px-3 py-3 text-left last:border-b-0 transition-colors ${
                                    selected
                                      ? "bg-red-500/10 text-white"
                                      : "hover:bg-zinc-900 text-zinc-300"
                                  }`}
                                >
                                  <p className="text-sm font-medium">
                                    {track.track_name}
                                  </p>
                                  <p className="mt-1 text-xs text-zinc-500">
                                    {track.config_name} · {track.category}
                                  </p>
                                </button>
                              );
                            })
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                      <p className="text-sm font-medium text-zinc-300 mb-3">
                        Race Length
                      </p>
                      <div className="flex gap-2 mb-4">
                        {(["laps", "time"] as RaceLengthMode[]).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() =>
                              setAddEventData((prev) => ({
                                ...prev,
                                lengthMode: mode,
                              }))
                            }
                            className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                              addEventData.lengthMode === mode
                                ? "bg-red-500 text-white"
                                : "bg-zinc-800 text-zinc-300 hover:text-white"
                            }`}
                          >
                            {mode === "laps" ? "By Laps" : "By Time"}
                          </button>
                        ))}
                      </div>

                      {addEventData.lengthMode === "laps" ? (
                        <div>
                          <label className="block text-sm font-medium text-zinc-300 mb-2">
                            Number of Laps
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={addEventData.lapCount}
                            onChange={(e) =>
                              setAddEventData((prev) => ({
                                ...prev,
                                lapCount: e.target.value,
                              }))
                            }
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                          />
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                              Hours
                            </label>
                            <select
                              value={addEventData.durationHours}
                              onChange={(e) =>
                                setAddEventData((prev) => ({
                                  ...prev,
                                  durationHours: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                            >
                              {Array.from({ length: 7 }, (_, index) => (
                                <option key={index} value={index}>
                                  {index} hour{index === 1 ? "" : "s"}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                              Minutes
                            </label>
                            <select
                              value={addEventData.durationMinutes}
                              onChange={(e) =>
                                setAddEventData((prev) => ({
                                  ...prev,
                                  durationMinutes: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                            >
                              {[0, 15, 30, 45].map((minutes) => (
                                <option key={minutes} value={minutes}>
                                  {minutes} minutes
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>

                    {addEventData.lengthMode === "laps" && (
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={addEventData.hasStages}
                              onChange={(e) =>
                                setAddEventData((prev) => ({
                                  ...prev,
                                  hasStages: e.target.checked,
                                  stages: e.target.checked ? prev.stages : [],
                                }))
                              }
                              className="h-4 w-4 rounded border-zinc-600"
                            />
                            <span className="text-sm font-medium text-zinc-300">
                              Race has stages
                            </span>
                          </label>
                        </div>

                        {addEventData.hasStages && (
                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm font-medium text-zinc-300 mb-2">
                                Number of Stages
                              </label>
                              <select
                                value={addEventData.stages.length}
                                onChange={(e) => {
                                  const newCount = parseInt(e.target.value, 10);
                                  const newStages = Array.from(
                                    { length: newCount },
                                    (_, i) =>
                                      addEventData.stages[i] || {
                                        stageNumber: i + 1,
                                        endLap: 0,
                                      },
                                  );
                                  setAddEventData((prev) => ({
                                    ...prev,
                                    stages: newStages,
                                  }));
                                  // Clear input fields for resized array
                                  const newInputs: Record<number, string> = {};
                                  for (let i = 0; i < newCount; i++) {
                                    newInputs[i] =
                                      stageLapInputs[i] ||
                                      String(newStages[i]?.endLap || "");
                                  }
                                  setStageLapInputs(newInputs);
                                }}
                                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                              >
                                {Array.from({ length: 6 }, (_, i) => (
                                  <option key={i} value={i}>
                                    {i === 0 ? "None" : i}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {addEventData.stages.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                  Stage End Laps (out of{" "}
                                  {addEventData.lapCount || "?"} laps)
                                </p>
                                {addEventData.stages.map((stage, index) => (
                                  <div key={index}>
                                    <label className="block text-xs text-zinc-400 mb-1">
                                      Stage {stage.stageNumber}
                                    </label>
                                    <input
                                      type="number"
                                      min="1"
                                      value={
                                        stageLapInputs[index] !== undefined
                                          ? stageLapInputs[index]
                                          : stage.endLap || ""
                                      }
                                      onChange={(e) => {
                                        const newValue = e.target.value;
                                        setStageLapInputs((prev) => ({
                                          ...prev,
                                          [index]: newValue,
                                        }));

                                        const lapNum = parseInt(newValue, 10);
                                        if (
                                          Number.isInteger(lapNum) &&
                                          lapNum > 0
                                        ) {
                                          setAddEventData((prev) => ({
                                            ...prev,
                                            stages: prev.stages.map((s, i) =>
                                              i === index
                                                ? { ...s, endLap: lapNum }
                                                : s,
                                            ),
                                          }));
                                        }
                                      }}
                                      placeholder={`Enter lap number`}
                                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none text-sm"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4 space-y-4">
                      <p className="text-sm font-medium text-zinc-300">
                        Race Purse & Payout
                      </p>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className="block text-sm font-medium text-zinc-300 mb-2">
                            Purse Amount ($)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={addEventData.virtualPurse}
                            onChange={(e) =>
                              setAddEventData((prev) => {
                                const purse = Math.max(
                                  0,
                                  parseInt(e.target.value, 10) || 0,
                                );
                                return {
                                  ...prev,
                                  virtualPurse: e.target.value,
                                  virtualPayoutSplit:
                                    prev.payoutPreset === "custom"
                                      ? prev.virtualPayoutSplit
                                      : distributePurse(
                                          purse,
                                          getPayoutPresetPercentages(
                                            prev.payoutPreset,
                                          ),
                                        ),
                                };
                              })
                            }
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-zinc-300 mb-2">
                            Payout Preset
                          </label>
                          <select
                            value={addEventData.payoutPreset}
                            onChange={(e) =>
                              applyAddEventPayoutPreset(
                                e.target.value as PayoutPresetKey,
                              )
                            }
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                          >
                            <option value="custom">Custom</option>
                            {PAYOUT_PRESETS.map((preset) => (
                              <option key={preset.key} value={preset.key}>
                                {preset.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {addEventData.virtualPayoutSplit.length > 0 && (
                        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
                            Driver Payout Preview
                          </p>
                          <div className="mb-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setAddEventData((prev) => ({
                                  ...prev,
                                  payoutPreset: "custom",
                                  virtualPayoutSplit: addPayoutSlot(
                                    prev.virtualPayoutSplit,
                                  ),
                                }))
                              }
                              className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
                            >
                              + Add Position
                            </button>
                            <button
                              type="button"
                              onClick={rebalanceAddEventPayouts}
                              className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
                            >
                              Rebalance Evenly
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs text-zinc-300 sm:grid-cols-3">
                            {addEventData.virtualPayoutSplit.map(
                              (amount, index) => (
                                <div
                                  key={`add-payout-${index}`}
                                  className="rounded border border-zinc-800 px-2 py-2"
                                >
                                  <div className="mb-1 flex items-center justify-between">
                                    <span>P{index + 1}</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setAddEventData((prev) => ({
                                          ...prev,
                                          payoutPreset: "custom",
                                          virtualPayoutSplit: removePayoutSlot(
                                            prev.virtualPayoutSplit,
                                            index,
                                          ),
                                        }))
                                      }
                                      className="text-[10px] text-zinc-500 transition-colors hover:text-red-400"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                  <input
                                    type="number"
                                    min="0"
                                    value={amount}
                                    onChange={(e) =>
                                      setAddEventData((prev) => ({
                                        ...prev,
                                        payoutPreset: "custom",
                                        virtualPayoutSplit: updatePayoutAmount(
                                          prev.virtualPayoutSplit,
                                          index,
                                          normalizePayoutInput(e.target.value),
                                        ),
                                      }))
                                    }
                                    className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white focus:border-red-500 focus:outline-none"
                                  />
                                </div>
                              ),
                            )}
                          </div>
                          <div className="mt-3 flex items-center justify-between text-xs">
                            <span className="text-zinc-500">
                              Total Allocated
                            </span>
                            <span
                              className={
                                sumPayoutSplit(
                                  addEventData.virtualPayoutSplit,
                                ) ===
                                Math.max(
                                  0,
                                  parseInt(addEventData.virtualPurse, 10) || 0,
                                )
                                  ? "text-green-400"
                                  : "text-yellow-400"
                              }
                            >
                              ${sumPayoutSplit(addEventData.virtualPayoutSplit)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <div>
                          <p className="text-sm font-medium text-zinc-300">
                            Weather
                          </p>
                          <p className="text-xs text-zinc-500">
                            Realistic skips manual weather settings.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {(["realistic", "constant"] as WeatherMode[]).map(
                            (mode) => (
                              <button
                                key={mode}
                                type="button"
                                onClick={() =>
                                  setAddEventData((prev) => ({
                                    ...prev,
                                    weatherMode: mode,
                                  }))
                                }
                                className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                                  addEventData.weatherMode === mode
                                    ? "bg-blue-500 text-white"
                                    : "bg-zinc-800 text-zinc-300 hover:text-white"
                                }`}
                              >
                                {mode === "realistic"
                                  ? "Realistic"
                                  : "Constant"}
                              </button>
                            ),
                          )}
                        </div>
                      </div>

                      {addEventData.weatherMode === "constant" && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                              Skies
                            </label>
                            <select
                              value={addEventData.skies}
                              onChange={(e) =>
                                setAddEventData((prev) => ({
                                  ...prev,
                                  skies: e.target.value as SkiesOption,
                                }))
                              }
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                            >
                              {SKY_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                              Temperature
                            </label>
                            <div className="grid grid-cols-[1fr_auto] gap-2">
                              <input
                                type="number"
                                value={addEventData.temperature}
                                onChange={(e) =>
                                  setAddEventData((prev) => ({
                                    ...prev,
                                    temperature: e.target.value,
                                  }))
                                }
                                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                              />
                              <select
                                value={addEventData.temperatureUnit}
                                onChange={(e) =>
                                  setAddEventData((prev) => ({
                                    ...prev,
                                    temperature: convertTemperatureValue(
                                      prev.temperature,
                                      prev.temperatureUnit,
                                      e.target.value as TemperatureUnit,
                                    ),
                                    temperatureUnit: e.target
                                      .value as TemperatureUnit,
                                  }))
                                }
                                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                              >
                                <option value="F">°F</option>
                                <option value="C">°C</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                              Relative Humidity
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={addEventData.humidity}
                              onChange={(e) =>
                                setAddEventData((prev) => ({
                                  ...prev,
                                  humidity: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                              placeholder="58%"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                              Fog
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={addEventData.fog}
                              onChange={(e) =>
                                setAddEventData((prev) => ({
                                  ...prev,
                                  fog: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                              placeholder="0%"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                              Wind Direction
                            </label>
                            <select
                              value={addEventData.windDirection}
                              onChange={(e) =>
                                setAddEventData((prev) => ({
                                  ...prev,
                                  windDirection: e.target
                                    .value as WindDirection,
                                }))
                              }
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                            >
                              {WIND_DIRECTIONS.map((direction) => (
                                <option key={direction} value={direction}>
                                  {direction}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                              Wind Speed
                            </label>
                            <div className="grid grid-cols-[1fr_auto] gap-2">
                              <input
                                type="number"
                                min="0"
                                value={addEventData.windSpeed}
                                onChange={(e) =>
                                  setAddEventData((prev) => ({
                                    ...prev,
                                    windSpeed: e.target.value,
                                  }))
                                }
                                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                                placeholder="5"
                              />
                              <select
                                value={addEventData.windSpeedUnit}
                                onChange={(e) =>
                                  setAddEventData((prev) => ({
                                    ...prev,
                                    windSpeed: convertWindSpeedValue(
                                      prev.windSpeed,
                                      prev.windSpeedUnit,
                                      e.target.value as WindSpeedUnit,
                                    ),
                                    windSpeedUnit: e.target
                                      .value as WindSpeedUnit,
                                  }))
                                }
                                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                              >
                                <option value="MPH">MPH</option>
                                <option value="KPH">KPH</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                  <p className="text-xs uppercase tracking-widest text-zinc-500">
                    Event Summary
                  </p>
                  <div className="mt-4 space-y-3 text-sm text-zinc-300">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">Series / Season</span>
                      <span className="text-right">Linked automatically</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">Track</span>
                      <span className="text-right">
                        {addEventData.isOffWeek
                          ? "Off week"
                          : addEventData.trackName
                            ? `${addEventData.trackName} · ${addEventData.trackConfigName}`
                            : "Select track"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">Surface</span>
                      <span>{addEventData.trackCategory || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">Race Length</span>
                      <span>{buildRaceLength(addEventData) || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">Weather</span>
                      <span className="capitalize">
                        {addEventData.weatherMode}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">Points / Drop</span>
                      <span>
                        {addEventData.pointsCount ? "Points" : "No points"}
                        {addEventData.canDrop ? " · Droppable" : ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">Race Purse</span>
                      <span>
                        $
                        {Math.max(
                          0,
                          parseInt(addEventData.virtualPurse, 10) || 0,
                        )}
                        {addEventData.virtualPayoutSplit.length > 0
                          ? ` · ${addEventData.virtualPayoutSplit.length} paid`
                          : ""}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={handleCreateEvent}
                disabled={addEventLoading}
                className="flex-1 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-700 disabled:text-zinc-500 px-4 py-2 text-sm font-medium text-white transition-colors"
              >
                {addEventLoading ? "Adding..." : "Add Event"}
              </button>
              <button
                onClick={() => {
                  setAddEventSeriesId(null);
                  setAddEventSeasonId(null);
                  setAddEventData(createDefaultEventFormState());
                  setTrackSearch("");
                }}
                className="flex-1 rounded-lg border border-zinc-700 hover:border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Event Modal */}
      {editEventId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h2 className="mb-6 text-xl font-bold text-white">Edit Event</h2>
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Event Name *
                  </label>
                  <input
                    type="text"
                    value={editEventData.raceName}
                    onChange={(e) =>
                      setEditEventData((prev) => ({
                        ...prev,
                        raceName: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
                    placeholder="e.g., Week 5 - Daytona 250"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Room Opens *
                    </label>
                    <input
                      type="datetime-local"
                      value={editEventData.roomOpenAt}
                      onChange={(e) =>
                        setEditEventData((prev) => ({
                          ...prev,
                          roomOpenAt: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Race Starts *
                    </label>
                    <input
                      type="datetime-local"
                      value={editEventData.raceStartAt}
                      onChange={(e) =>
                        setEditEventData((prev) => ({
                          ...prev,
                          raceStartAt: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editEventData.isOffWeek}
                      onChange={(e) =>
                        setEditEventData((prev) => ({
                          ...prev,
                          isOffWeek: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded border-zinc-600"
                    />
                    <span className="text-sm text-zinc-300">Off Week</span>
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editEventData.pointsCount}
                      onChange={(e) =>
                        setEditEventData((prev) => ({
                          ...prev,
                          pointsCount: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded border-zinc-600"
                    />
                    <span className="text-sm text-zinc-300">Points Race</span>
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editEventData.canDrop}
                      onChange={(e) =>
                        setEditEventData((prev) => ({
                          ...prev,
                          canDrop: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded border-zinc-600"
                    />
                    <span className="text-sm text-zinc-300">
                      Week Can Be Dropped
                    </span>
                  </label>
                  <label className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/50 px-4 py-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editEventData.registrationEnabled}
                      onChange={(e) =>
                        setEditEventData((prev) => ({
                          ...prev,
                          registrationEnabled: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded border-zinc-600"
                    />
                    <span className="text-sm text-zinc-300">
                      Registration Enabled
                    </span>
                  </label>
                </div>

                {!editEventData.isOffWeek && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">
                        iRacing Track *
                      </label>
                      <input
                        type="text"
                        value={editTrackSearch}
                        onChange={(e) => setEditTrackSearch(e.target.value)}
                        placeholder="Search tracks or configs"
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none"
                      />
                      <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/50">
                        {tracksLoading ? (
                          <div className="px-3 py-4 text-sm text-zinc-500">
                            Loading tracks...
                          </div>
                        ) : (
                          tracks
                            .filter((track) => {
                              const query = editTrackSearch
                                .trim()
                                .toLowerCase();
                              if (!query) return true;
                              return [
                                track.track_name,
                                track.config_name,
                                track.category,
                              ]
                                .join(" ")
                                .toLowerCase()
                                .includes(query);
                            })
                            .slice(0, 12)
                            .map((track) => {
                              const selected =
                                editEventData.trackId ===
                                  String(track.track_id) &&
                                editEventData.trackConfigName ===
                                  track.config_name;
                              return (
                                <button
                                  key={`${track.track_id}-${track.config_name}`}
                                  type="button"
                                  onClick={() => {
                                    setEditEventData((prev) => ({
                                      ...prev,
                                      trackId: String(track.track_id),
                                      trackName: track.track_name,
                                      trackConfigName: track.config_name,
                                      trackCategory: track.category,
                                    }));
                                    setEditTrackSearch(
                                      `${track.track_name} · ${track.config_name}`,
                                    );
                                  }}
                                  className={`w-full border-b border-zinc-800 px-3 py-3 text-left last:border-b-0 transition-colors ${
                                    selected
                                      ? "bg-red-500/10 text-white"
                                      : "hover:bg-zinc-900 text-zinc-300"
                                  }`}
                                >
                                  <p className="text-sm font-medium">
                                    {track.track_name}
                                  </p>
                                  <p className="mt-1 text-xs text-zinc-500">
                                    {track.config_name} · {track.category}
                                  </p>
                                </button>
                              );
                            })
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                      <p className="text-sm font-medium text-zinc-300 mb-3">
                        Race Length
                      </p>
                      <div className="flex gap-2 mb-4">
                        {(["laps", "time"] as RaceLengthMode[]).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() =>
                              setEditEventData((prev) => ({
                                ...prev,
                                lengthMode: mode,
                              }))
                            }
                            className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                              editEventData.lengthMode === mode
                                ? "bg-red-500 text-white"
                                : "bg-zinc-800 text-zinc-300 hover:text-white"
                            }`}
                          >
                            {mode === "laps" ? "By Laps" : "By Time"}
                          </button>
                        ))}
                      </div>

                      {editEventData.lengthMode === "laps" ? (
                        <div>
                          <label className="block text-sm font-medium text-zinc-300 mb-2">
                            Number of Laps
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={editEventData.lapCount}
                            onChange={(e) =>
                              setEditEventData((prev) => ({
                                ...prev,
                                lapCount: e.target.value,
                              }))
                            }
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                          />
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                              Hours
                            </label>
                            <select
                              value={editEventData.durationHours}
                              onChange={(e) =>
                                setEditEventData((prev) => ({
                                  ...prev,
                                  durationHours: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                            >
                              {Array.from({ length: 7 }, (_, index) => (
                                <option key={index} value={index}>
                                  {index} hour{index === 1 ? "" : "s"}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                              Minutes
                            </label>
                            <select
                              value={editEventData.durationMinutes}
                              onChange={(e) =>
                                setEditEventData((prev) => ({
                                  ...prev,
                                  durationMinutes: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                            >
                              {[0, 15, 30, 45].map((minutes) => (
                                <option key={minutes} value={minutes}>
                                  {minutes} minutes
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>

                    {editEventData.lengthMode === "laps" && (
                      <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editEventData.hasStages}
                              onChange={(e) =>
                                setEditEventData((prev) => ({
                                  ...prev,
                                  hasStages: e.target.checked,
                                  stages: e.target.checked ? prev.stages : [],
                                }))
                              }
                              className="h-4 w-4 rounded border-zinc-600"
                            />
                            <span className="text-sm font-medium text-zinc-300">
                              Race has stages
                            </span>
                          </label>
                        </div>

                        {editEventData.hasStages && (
                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm font-medium text-zinc-300 mb-2">
                                Number of Stages
                              </label>
                              <select
                                value={editEventData.stages.length}
                                onChange={(e) => {
                                  const newCount = parseInt(e.target.value, 10);
                                  const newStages = Array.from(
                                    { length: newCount },
                                    (_, i) =>
                                      editEventData.stages[i] || {
                                        stageNumber: i + 1,
                                        endLap: 0,
                                      },
                                  );
                                  setEditEventData((prev) => ({
                                    ...prev,
                                    stages: newStages,
                                  }));
                                  // Clear input fields for resized array
                                  const newInputs: Record<number, string> = {};
                                  for (let i = 0; i < newCount; i++) {
                                    newInputs[i] =
                                      editStageLapInputs[i] ||
                                      String(newStages[i]?.endLap || "");
                                  }
                                  setEditStageLapInputs(newInputs);
                                }}
                                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                              >
                                {Array.from({ length: 6 }, (_, i) => (
                                  <option key={i} value={i}>
                                    {i === 0 ? "None" : i}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {editEventData.stages.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                                  Stage End Laps (out of{" "}
                                  {editEventData.lapCount || "?"} laps)
                                </p>
                                {editEventData.stages.map((stage, index) => (
                                  <div key={index}>
                                    <label className="block text-xs text-zinc-400 mb-1">
                                      Stage {stage.stageNumber}
                                    </label>
                                    <input
                                      type="number"
                                      min="1"
                                      value={
                                        editStageLapInputs[index] !== undefined
                                          ? editStageLapInputs[index]
                                          : stage.endLap || ""
                                      }
                                      onChange={(e) => {
                                        const newValue = e.target.value;
                                        setEditStageLapInputs((prev) => ({
                                          ...prev,
                                          [index]: newValue,
                                        }));

                                        const lapNum = parseInt(newValue, 10);
                                        if (
                                          Number.isInteger(lapNum) &&
                                          lapNum > 0
                                        ) {
                                          setEditEventData((prev) => ({
                                            ...prev,
                                            stages: prev.stages.map((s, i) =>
                                              i === index
                                                ? { ...s, endLap: lapNum }
                                                : s,
                                            ),
                                          }));
                                        }
                                      }}
                                      placeholder={`Enter lap number`}
                                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none text-sm"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4 space-y-4">
                      <p className="text-sm font-medium text-zinc-300">
                        Race Purse & Payout
                      </p>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className="block text-sm font-medium text-zinc-300 mb-2">
                            Purse Amount ($)
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={editEventData.virtualPurse}
                            onChange={(e) =>
                              setEditEventData((prev) => {
                                const purse = Math.max(
                                  0,
                                  parseInt(e.target.value, 10) || 0,
                                );
                                return {
                                  ...prev,
                                  virtualPurse: e.target.value,
                                  virtualPayoutSplit:
                                    prev.payoutPreset === "custom"
                                      ? prev.virtualPayoutSplit
                                      : distributePurse(
                                          purse,
                                          getPayoutPresetPercentages(
                                            prev.payoutPreset,
                                          ),
                                        ),
                                };
                              })
                            }
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                            placeholder="0"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-zinc-300 mb-2">
                            Payout Preset
                          </label>
                          <select
                            value={editEventData.payoutPreset}
                            onChange={(e) =>
                              applyEditEventPayoutPreset(
                                e.target.value as PayoutPresetKey,
                              )
                            }
                            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                          >
                            <option value="custom">Custom</option>
                            {PAYOUT_PRESETS.map((preset) => (
                              <option key={preset.key} value={preset.key}>
                                {preset.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {editEventData.virtualPayoutSplit.length > 0 && (
                        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                          <p className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
                            Driver Payout Preview
                          </p>
                          <div className="mb-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setEditEventData((prev) => ({
                                  ...prev,
                                  payoutPreset: "custom",
                                  virtualPayoutSplit: addPayoutSlot(
                                    prev.virtualPayoutSplit,
                                  ),
                                }))
                              }
                              className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
                            >
                              + Add Position
                            </button>
                            <button
                              type="button"
                              onClick={rebalanceEditEventPayouts}
                              className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
                            >
                              Rebalance Evenly
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs text-zinc-300 sm:grid-cols-3">
                            {editEventData.virtualPayoutSplit.map(
                              (amount, index) => (
                                <div
                                  key={`edit-payout-${index}`}
                                  className="rounded border border-zinc-800 px-2 py-2"
                                >
                                  <div className="mb-1 flex items-center justify-between">
                                    <span>P{index + 1}</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setEditEventData((prev) => ({
                                          ...prev,
                                          payoutPreset: "custom",
                                          virtualPayoutSplit: removePayoutSlot(
                                            prev.virtualPayoutSplit,
                                            index,
                                          ),
                                        }))
                                      }
                                      className="text-[10px] text-zinc-500 transition-colors hover:text-red-400"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                  <input
                                    type="number"
                                    min="0"
                                    value={amount}
                                    onChange={(e) =>
                                      setEditEventData((prev) => ({
                                        ...prev,
                                        payoutPreset: "custom",
                                        virtualPayoutSplit: updatePayoutAmount(
                                          prev.virtualPayoutSplit,
                                          index,
                                          normalizePayoutInput(e.target.value),
                                        ),
                                      }))
                                    }
                                    className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white focus:border-red-500 focus:outline-none"
                                  />
                                </div>
                              ),
                            )}
                          </div>
                          <div className="mt-3 flex items-center justify-between text-xs">
                            <span className="text-zinc-500">
                              Total Allocated
                            </span>
                            <span
                              className={
                                sumPayoutSplit(
                                  editEventData.virtualPayoutSplit,
                                ) ===
                                Math.max(
                                  0,
                                  parseInt(editEventData.virtualPurse, 10) || 0,
                                )
                                  ? "text-green-400"
                                  : "text-yellow-400"
                              }
                            >
                              $
                              {sumPayoutSplit(editEventData.virtualPayoutSplit)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                      <div className="flex items-center justify-between gap-3 mb-4">
                        <div>
                          <p className="text-sm font-medium text-zinc-300">
                            Weather
                          </p>
                          <p className="text-xs text-zinc-500">
                            Realistic skips manual weather settings.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {(["realistic", "constant"] as WeatherMode[]).map(
                            (mode) => (
                              <button
                                key={mode}
                                type="button"
                                onClick={() =>
                                  setEditEventData((prev) => ({
                                    ...prev,
                                    weatherMode: mode,
                                  }))
                                }
                                className={`rounded-lg px-3 py-2 text-sm transition-colors ${
                                  editEventData.weatherMode === mode
                                    ? "bg-blue-500 text-white"
                                    : "bg-zinc-800 text-zinc-300 hover:text-white"
                                }`}
                              >
                                {mode === "realistic"
                                  ? "Realistic"
                                  : "Constant"}
                              </button>
                            ),
                          )}
                        </div>
                      </div>

                      {editEventData.weatherMode === "constant" && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                              Skies
                            </label>
                            <select
                              value={editEventData.skies}
                              onChange={(e) =>
                                setEditEventData((prev) => ({
                                  ...prev,
                                  skies: e.target.value as SkiesOption,
                                }))
                              }
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                            >
                              {SKY_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                              Temperature
                            </label>
                            <div className="grid grid-cols-[1fr_auto] gap-2">
                              <input
                                type="number"
                                value={editEventData.temperature}
                                onChange={(e) =>
                                  setEditEventData((prev) => ({
                                    ...prev,
                                    temperature: e.target.value,
                                  }))
                                }
                                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                              />
                              <select
                                value={editEventData.temperatureUnit}
                                onChange={(e) =>
                                  setEditEventData((prev) => ({
                                    ...prev,
                                    temperature: convertTemperatureValue(
                                      prev.temperature,
                                      prev.temperatureUnit,
                                      e.target.value as TemperatureUnit,
                                    ),
                                    temperatureUnit: e.target
                                      .value as TemperatureUnit,
                                  }))
                                }
                                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                              >
                                <option value="F">°F</option>
                                <option value="C">°C</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                              Relative Humidity
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={editEventData.humidity}
                              onChange={(e) =>
                                setEditEventData((prev) => ({
                                  ...prev,
                                  humidity: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                              placeholder="58%"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                              Fog
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={editEventData.fog}
                              onChange={(e) =>
                                setEditEventData((prev) => ({
                                  ...prev,
                                  fog: e.target.value,
                                }))
                              }
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                              placeholder="0%"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                              Wind Direction
                            </label>
                            <select
                              value={editEventData.windDirection}
                              onChange={(e) =>
                                setEditEventData((prev) => ({
                                  ...prev,
                                  windDirection: e.target
                                    .value as WindDirection,
                                }))
                              }
                              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                            >
                              {WIND_DIRECTIONS.map((direction) => (
                                <option key={direction} value={direction}>
                                  {direction}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-2">
                              Wind Speed
                            </label>
                            <div className="grid grid-cols-[1fr_auto] gap-2">
                              <input
                                type="number"
                                min="0"
                                value={editEventData.windSpeed}
                                onChange={(e) =>
                                  setEditEventData((prev) => ({
                                    ...prev,
                                    windSpeed: e.target.value,
                                  }))
                                }
                                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                                placeholder="5"
                              />
                              <select
                                value={editEventData.windSpeedUnit}
                                onChange={(e) =>
                                  setEditEventData((prev) => ({
                                    ...prev,
                                    windSpeed: convertWindSpeedValue(
                                      prev.windSpeed,
                                      prev.windSpeedUnit,
                                      e.target.value as WindSpeedUnit,
                                    ),
                                    windSpeedUnit: e.target
                                      .value as WindSpeedUnit,
                                  }))
                                }
                                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-red-500 focus:outline-none"
                              >
                                <option value="MPH">MPH</option>
                                <option value="KPH">KPH</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                  <p className="text-xs uppercase tracking-widest text-zinc-500">
                    Event Summary
                  </p>
                  <div className="mt-4 space-y-3 text-sm text-zinc-300">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">Series / Season</span>
                      <span className="text-right">Linked automatically</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">Track</span>
                      <span className="text-right">
                        {editEventData.isOffWeek
                          ? "Off week"
                          : editEventData.trackName
                            ? [
                                editEventData.trackName,
                                editEventData.trackConfigName,
                              ]
                                .filter(Boolean)
                                .join(" · ")
                            : "Select track"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">Surface</span>
                      <span>{editEventData.trackCategory || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">Race Length</span>
                      <span>{buildRaceLength(editEventData) || "—"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">Weather</span>
                      <span className="capitalize">
                        {editEventData.weatherMode}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">Points / Drop</span>
                      <span>
                        {editEventData.pointsCount ? "Points" : "No points"}
                        {editEventData.canDrop ? " · Droppable" : ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">Race Purse</span>
                      <span>
                        $
                        {Math.max(
                          0,
                          parseInt(editEventData.virtualPurse, 10) || 0,
                        )}
                        {editEventData.virtualPayoutSplit.length > 0
                          ? ` · ${editEventData.virtualPayoutSplit.length} paid`
                          : ""}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={handleUpdateEvent}
                disabled={editEventLoading}
                className="flex-1 rounded-lg bg-red-500 hover:bg-red-600 disabled:bg-zinc-700 disabled:text-zinc-500 px-4 py-2 text-sm font-medium text-white transition-colors"
              >
                {editEventLoading ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={() => {
                  setEditEventId(null);
                  setEditEventSeriesId(null);
                  setEditEventSeasonId(null);
                  setEditEventData(createDefaultEventFormState());
                  setEditTrackSearch("");
                }}
                className="flex-1 rounded-lg border border-zinc-700 hover:border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Race Results Modal */}
      {resultsModalData && league && (
        <RaceResultsModal
          leagueId={league.id}
          seriesId={resultsModalData.seriesId}
          season={resultsModalData.season}
          onClose={() => setResultsModalData(null)}
        />
      )}
    </div>
  );
}
