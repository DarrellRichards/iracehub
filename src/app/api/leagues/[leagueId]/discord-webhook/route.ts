import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";
import { notifyEventCreated } from "@/lib/discord/webhook";

async function assertLeagueAdmin(leagueId: string, req: NextRequest) {
  const accessToken = req.cookies.get("irh_access_token")?.value;
  if (!accessToken) return { ok: false as const, status: 401 };

  const iracingCustId = getIracingCustIdFromJwt(accessToken);
  const user = await prisma.user.findUnique({
    where: { iracingCustId },
    select: { id: true },
  });
  if (!user) return { ok: false as const, status: 404 };

  const membership = await prisma.leagueMembership.findUnique({
    where: { userId_leagueId: { userId: user.id, leagueId } },
    select: { owner: true, admin: true },
  });
  if (!membership || (!membership.owner && !membership.admin)) {
    return { ok: false as const, status: 403 };
  }

  return { ok: true as const };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await context.params;

  const auth = await assertLeagueAdmin(leagueId, req);
  if (!auth.ok) {
    return Response.json({ error: "unauthorized" }, { status: auth.status });
  }

  const config = await prisma.discordWebhookConfig.findUnique({
    where: { leagueId },
  });

  if (!config) {
    return Response.json({
      webhookUrl: null,
      onEventCreated: true,
      onDayOfEvent: true,
      onResultsUploaded: true,
    });
  }

  return Response.json({
    webhookUrl: config.webhookUrl,
    onEventCreated: config.onEventCreated,
    onDayOfEvent: config.onDayOfEvent,
    onResultsUploaded: config.onResultsUploaded,
  });
}

interface WebhookConfigBody {
  webhookUrl?: string | null;
  onEventCreated?: boolean;
  onDayOfEvent?: boolean;
  onResultsUploaded?: boolean;
  test?: boolean;
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await context.params;

  const auth = await assertLeagueAdmin(leagueId, req);
  if (!auth.ok) {
    return Response.json({ error: "unauthorized" }, { status: auth.status });
  }

  const body = (await req.json()) as WebhookConfigBody;

  // Validate webhook URL if provided
  if (body.webhookUrl) {
    try {
      const url = new URL(body.webhookUrl);
      if (
        !url.hostname.endsWith("discord.com") &&
        !url.hostname.endsWith("discordapp.com")
      ) {
        return Response.json(
          {
            error: "invalid_webhook_url",
            message: "Must be a Discord webhook URL.",
          },
          { status: 400 },
        );
      }
    } catch {
      return Response.json(
        { error: "invalid_webhook_url", message: "Invalid URL format." },
        { status: 400 },
      );
    }
  }

  // If webhookUrl is explicitly null or empty string, delete the config
  if (body.webhookUrl === null || body.webhookUrl === "") {
    await prisma.discordWebhookConfig.deleteMany({ where: { leagueId } });
    return Response.json({ webhookUrl: null });
  }

  if (!body.webhookUrl) {
    // Partial update — only update toggle fields if config exists
    const existing = await prisma.discordWebhookConfig.findUnique({
      where: { leagueId },
    });
    if (!existing) {
      return Response.json({ error: "no_webhook_configured" }, { status: 404 });
    }

    const updated = await prisma.discordWebhookConfig.update({
      where: { leagueId },
      data: {
        onEventCreated: body.onEventCreated ?? existing.onEventCreated,
        onDayOfEvent: body.onDayOfEvent ?? existing.onDayOfEvent,
        onResultsUploaded: body.onResultsUploaded ?? existing.onResultsUploaded,
      },
    });

    return Response.json({
      webhookUrl: updated.webhookUrl,
      onEventCreated: updated.onEventCreated,
      onDayOfEvent: updated.onDayOfEvent,
      onResultsUploaded: updated.onResultsUploaded,
    });
  }

  // Upsert the full config
  const config = await prisma.discordWebhookConfig.upsert({
    where: { leagueId },
    create: {
      leagueId,
      webhookUrl: body.webhookUrl,
      onEventCreated: body.onEventCreated ?? true,
      onDayOfEvent: body.onDayOfEvent ?? true,
      onResultsUploaded: body.onResultsUploaded ?? true,
    },
    update: {
      webhookUrl: body.webhookUrl,
      onEventCreated: body.onEventCreated ?? true,
      onDayOfEvent: body.onDayOfEvent ?? true,
      onResultsUploaded: body.onResultsUploaded ?? true,
    },
  });

  // Optionally send a test notification
  if (body.test) {
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { leagueName: true },
    });

    void notifyEventCreated(config.webhookUrl, {
      leagueName: league?.leagueName ?? "Your League",
      seriesName: "Example Series",
      raceName: "Test Notification",
      eventDate: new Date(),
      trackName: "Daytona International Speedway",
      raceLength: "50 laps",
    });
  }

  return Response.json({
    webhookUrl: config.webhookUrl,
    onEventCreated: config.onEventCreated,
    onDayOfEvent: config.onDayOfEvent,
    onResultsUploaded: config.onResultsUploaded,
  });
}
