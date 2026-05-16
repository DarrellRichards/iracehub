/**
 * Discord webhook utilities for iRaceHub league notifications.
 * Sends rich embeds to a configured Discord channel webhook.
 */

interface DiscordEmbed {
  title: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string;
}

interface DiscordWebhookPayload {
  username?: string;
  avatar_url?: string;
  embeds: DiscordEmbed[];
}

// iRaceHub brand red
const COLOR_RED = 0xe53935;
const COLOR_GREEN = 0x43a047;
const COLOR_BLUE = 0x1e88e5;

async function sendWebhook(
  webhookUrl: string,
  payload: DiscordWebhookPayload,
): Promise<void> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[Discord Webhook] Failed to send: HTTP ${res.status} - ${body}`,
      );
    }
  } catch (err) {
    console.error("[Discord Webhook] Network error:", err);
  }
}

/**
 * Notify Discord that a new event/race has been created on the schedule.
 */
export async function notifyEventCreated(
  webhookUrl: string,
  payload: {
    leagueName: string;
    seriesName: string;
    raceName: string;
    eventDate: Date;
    trackName?: string | null;
    raceLength?: string | null;
    leagueUrl?: string | null;
  },
): Promise<void> {
  const dateStr = payload.eventDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  const fields: DiscordEmbed["fields"] = [
    { name: "Series", value: payload.seriesName, inline: true },
    { name: "Date", value: dateStr, inline: true },
  ];

  if (payload.trackName) {
    fields.push({ name: "Track", value: payload.trackName, inline: true });
  }

  if (payload.raceLength) {
    fields.push({
      name: "Race Length",
      value: payload.raceLength,
      inline: true,
    });
  }

  await sendWebhook(webhookUrl, {
    username: "iRaceHub",
    embeds: [
      {
        title: `📅 New Event Added: ${payload.raceName}`,
        description: `A new event has been added to the **${payload.leagueName}** schedule.`,
        color: COLOR_BLUE,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: "iRaceHub" },
      },
    ],
  });
}

/**
 * Notify Discord that today is race day.
 */
export async function notifyDayOfEvent(
  webhookUrl: string,
  payload: {
    leagueName: string;
    seriesName: string;
    raceName: string;
    eventDate: Date;
    trackName?: string | null;
    raceLength?: string | null;
    registrationCount?: number;
  },
): Promise<void> {
  const fields: DiscordEmbed["fields"] = [
    { name: "Series", value: payload.seriesName, inline: true },
    { name: "Track", value: payload.trackName ?? "TBD", inline: true },
  ];

  if (payload.raceLength) {
    fields.push({
      name: "Race Length",
      value: payload.raceLength,
      inline: true,
    });
  }

  if (payload.registrationCount != null) {
    fields.push({
      name: "Registered Drivers",
      value: String(payload.registrationCount),
      inline: true,
    });
  }

  await sendWebhook(webhookUrl, {
    username: "iRaceHub",
    embeds: [
      {
        title: `🏁 Race Day: ${payload.raceName}`,
        description: `Today is race day for **${payload.leagueName}**! Get ready to race.`,
        color: COLOR_RED,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: "iRaceHub" },
      },
    ],
  });
}

/**
 * Notify Discord that race results have been uploaded.
 */
export async function notifyResultsUploaded(
  webhookUrl: string,
  payload: {
    leagueName: string;
    seriesName: string;
    raceName: string;
    eventDate: Date;
    trackName?: string | null;
    winnerName?: string | null;
    resultCount: number;
  },
): Promise<void> {
  const dateStr = payload.eventDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  const fields: DiscordEmbed["fields"] = [
    { name: "Series", value: payload.seriesName, inline: true },
    { name: "Date", value: dateStr, inline: true },
  ];

  if (payload.trackName) {
    fields.push({ name: "Track", value: payload.trackName, inline: true });
  }

  if (payload.winnerName) {
    fields.push({
      name: "🏆 Winner",
      value: payload.winnerName,
      inline: true,
    });
  }

  fields.push({
    name: "Results",
    value: `${payload.resultCount} driver${payload.resultCount !== 1 ? "s" : ""} classified`,
    inline: true,
  });

  await sendWebhook(webhookUrl, {
    username: "iRaceHub",
    embeds: [
      {
        title: `✅ Results Posted: ${payload.raceName}`,
        description: `Race results for **${payload.leagueName}** have been uploaded.`,
        color: COLOR_GREEN,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: "iRaceHub" },
      },
    ],
  });
}
