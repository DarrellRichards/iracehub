import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyDayOfEvent } from "@/lib/discord/webhook";

/**
 * GET /api/cron/day-of-event
 *
 * Fires Discord "day of event" notifications for all leagues that have a race
 * scheduled today and have a Discord webhook configured with onDayOfEvent enabled.
 *
 * Intended to be called once per day (e.g. via Vercel Cron or an external
 * scheduler). Protect with a secret token in production.
 *
 * Example Vercel cron config (vercel.json):
 *   { "crons": [{ "path": "/api/cron/day-of-event", "schedule": "0 12 * * *" }] }
 */
export async function GET(req: NextRequest) {
  // Optional: verify a shared secret to prevent unauthorized triggers
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    const providedToken = authHeader?.replace("Bearer ", "");
    if (providedToken !== cronSecret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();

  // Build a UTC day window [start of today, start of tomorrow)
  const todayStart = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  // Find all non-off-week schedules happening today that have a league with a
  // Discord webhook configured with onDayOfEvent enabled
  const schedulesToday = await prisma.schedule.findMany({
    where: {
      isOffWeek: false,
      eventDate: { gte: todayStart, lt: todayEnd },
      season: {
        series: {
          league: {
            discordWebhook: {
              onDayOfEvent: true,
            },
          },
        },
      },
    },
    select: {
      id: true,
      raceName: true,
      eventDate: true,
      trackName: true,
      raceLength: true,
      _count: { select: { registrations: true } },
      season: {
        select: {
          series: {
            select: {
              name: true,
              league: {
                select: {
                  leagueName: true,
                  discordWebhook: {
                    select: {
                      webhookUrl: true,
                      onDayOfEvent: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  let notified = 0;
  const errors: string[] = [];

  await Promise.allSettled(
    schedulesToday.map(async (schedule) => {
      const league = schedule.season.series.league;
      const webhook = league.discordWebhook;

      if (!webhook?.onDayOfEvent || !webhook.webhookUrl) return;

      try {
        await notifyDayOfEvent(webhook.webhookUrl, {
          leagueName: league.leagueName,
          seriesName: schedule.season.series.name,
          raceName: schedule.raceName,
          eventDate: schedule.eventDate,
          trackName: schedule.trackName,
          raceLength: schedule.raceLength,
          registrationCount: schedule._count.registrations,
        });
        notified++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Schedule ${schedule.id}: ${msg}`);
        console.error(
          `[Cron/DayOfEvent] Failed for schedule ${schedule.id}:`,
          err,
        );
      }
    }),
  );

  return NextResponse.json({
    date: todayStart.toISOString().split("T")[0],
    schedulesFound: schedulesToday.length,
    notified,
    errors: errors.length > 0 ? errors : undefined,
  });
}
