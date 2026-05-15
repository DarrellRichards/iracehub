export const REGISTRATION_LOCK_WINDOW_MS = 20 * 60 * 1000;

export interface RegistrationState {
  isClosed: boolean;
  summaryLabel: string | null;
  actionLabel: string | null;
  helperText: string | null;
}

export interface SeriesLike {
  id: string;
  name: string;
  season?: {
    seasonName: string;
  } | null;
  nextEvent?: {
    id: string;
    eventDate: string;
    raceName: string;
    registrationEnabled: boolean;
    registrationCount: number;
    isRegisteredByMe: boolean;
    importedSession?: {
      hasResults: boolean;
      trackName: string | null;
    } | null;
    trackName: string | null;
    raceLength: string | null;
    weather?: Record<string, unknown>;
    roomOpenTime?: string | null;
    greenFlagTime?: string | null;
    stages?: Array<{ stageNumber: number; endLap: number }> | null;
  } | null;
}

export function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function fmtPoints(value: number) {
  return value % 1 === 0 ? String(value) : value.toFixed(1);
}

export function formatStages(
  stages: Array<{ stageNumber: number; endLap: number }> | null | undefined,
): string {
  if (!stages || stages.length === 0) return "";
  if (stages.length === 1) {
    return `${stages.length} Stage (Lap ${stages[0]!.endLap})`;
  }
  const lapsList = stages.map((s) => s.endLap).join(", ");
  return `${stages.length} Stages (Laps ${lapsList})`;
}

export function relativeEventLabel(dateStr: string, nowMs = Date.now()) {
  const nowDate = new Date(nowMs);
  const eventDate = new Date(dateStr);

  const startOfNow = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth(),
    nowDate.getDate(),
  ).getTime();
  const startOfEvent = new Date(
    eventDate.getFullYear(),
    eventDate.getMonth(),
    eventDate.getDate(),
  ).getTime();

  const diffDays = Math.round((startOfEvent - startOfNow) / 86400000);

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) return `In ${diffDays} days`;
  return "Upcoming";
}

export function getRegistrationState(
  args: {
    eventDate: string;
    registrationEnabled: boolean;
    hasResults: boolean;
  },
  nowMs = Date.now(),
): RegistrationState {
  const eventTime = new Date(args.eventDate).getTime();
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

  if (nowMs >= eventTime) {
    return {
      isClosed: true,
      summaryLabel: "Event passed",
      actionLabel: "Event Passed",
      helperText: "This event has already started or finished.",
    };
  }

  if (nowMs >= lockTime) {
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

export function calculateLandingStats(
  data: {
    league?: { rosterCount: number | null } | null;
    series?: SeriesLike[] | null;
  } | null,
) {
  const series = data?.series ?? [];
  return {
    memberCount: data?.league?.rosterCount ?? 0,
    seriesCount: series.length,
    nextEvents: series.filter((item) => item.nextEvent).length,
  };
}

export function pickFeaturedNextRace(series: SeriesLike[]) {
  return (
    series
      .filter((item) => item.nextEvent)
      .map((item) => ({
        seriesId: item.id,
        seriesName: item.name,
        seasonName: item.season?.seasonName ?? null,
        event: item.nextEvent!,
      }))
      .sort(
        (a, b) =>
          new Date(a.event.eventDate).getTime() -
          new Date(b.event.eventDate).getTime(),
      )[0] ?? null
  );
}

export function flattenUpcomingEvents(series: SeriesLike[]) {
  return series
    .filter((item) => item.nextEvent)
    .map((item) => ({
      seriesId: item.id,
      seriesName: item.name,
      seasonName: item.season?.seasonName ?? null,
      event: item.nextEvent!,
    }))
    .sort(
      (a, b) =>
        new Date(a.event.eventDate).getTime() -
        new Date(b.event.eventDate).getTime(),
    );
}

export function getActiveSeries<T extends { id: string }>(
  series: T[],
  activeSeriesId: string | null,
) {
  if (!series.length) return null;
  if (!activeSeriesId) return series[0];
  return series.find((item) => item.id === activeSeriesId) ?? series[0];
}

export async function readJsonSafely<T>(response: Response): Promise<T | null> {
  try {
    const raw = await response.text();
    if (!raw.trim()) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export interface WeatherData {
  type?: "Set" | "Realistic";
  skies?: string;
  temp?: number;
  humidity?: number;
  fog?: number;
  windDirection?: string;
  windSpeed?: number;
}

export function formatWeather(
  weather: Record<string, unknown> | null | undefined,
): string {
  if (!weather || typeof weather !== "object") {
    return "Weather TBD";
  }

  const w = weather as WeatherData;

  const parts: string[] = [];

  if (w.temp !== undefined && w.temp !== null) {
    parts.push(`${Math.round(w.temp)}°F`);
  }

  if (w.skies) {
    parts.push(w.skies);
  }

  if (w.humidity !== undefined && w.humidity !== null) {
    parts.push(`${Math.round(w.humidity)}% humid`);
  }

  if (w.windSpeed !== undefined && w.windSpeed !== null && w.windSpeed > 0) {
    const dir = w.windDirection || "wind";
    parts.push(`${dir} ${Math.round(w.windSpeed)} mph`);
  }

  return parts.length > 0 ? parts.join(" · ") : "Weather TBD";
}

export function timeUntilEvent(
  eventDateStr: string,
  nowMs = Date.now(),
): {
  label: string;
  hoursRemaining: number;
  isImminent: boolean;
} {
  const eventTime = new Date(eventDateStr).getTime();
  const msRemaining = eventTime - nowMs;
  const hoursRemaining = msRemaining / (1000 * 60 * 60);

  let label = "";
  if (hoursRemaining < 0) {
    label = "Event started";
  } else if (hoursRemaining < 1) {
    const minutesRemaining = Math.round(msRemaining / (1000 * 60));
    label = `In ${minutesRemaining} minute${minutesRemaining !== 1 ? "s" : ""}`;
  } else if (hoursRemaining < 24) {
    const hours = Math.round(hoursRemaining);
    label = `In ${hours} hour${hours !== 1 ? "s" : ""}`;
  } else {
    const days = Math.round(hoursRemaining / 24);
    label = `In ${days} day${days !== 1 ? "s" : ""}`;
  }

  return {
    label,
    hoursRemaining,
    isImminent: hoursRemaining >= 0 && hoursRemaining < 24,
  };
}
