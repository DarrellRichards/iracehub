import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";
import { Prisma } from "@prisma/client";

interface ScheduleRequest {
  eventDate: string;
  raceName: string;
  isOffWeek: boolean;
  pointsCount: boolean;
  canDrop: boolean;
  registrationEnabled?: boolean;
  trackName?: string;
  trackId?: number;
  raceLength?: string;
  virtualPurse?: number;
  virtualEntryFee?: number;
  virtualPayoutSplit?: number[];
  stages?: Array<{ stageNumber: number; endLap: number }>;
  weather: Record<string, unknown>;
  raceOrder: number;
}

function normalizePayoutSplit(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((amount) =>
      Number.isFinite(amount) && Number(amount) >= 0
        ? Math.floor(Number(amount))
        : 0,
    )
    .filter((amount) => amount >= 0);
}

function normalizeStages(
  stages: ScheduleRequest["stages"],
): Array<{ stageNumber: number; endLap: number }> {
  if (!Array.isArray(stages)) return [];

  return stages
    .filter((stage) => Number.isInteger(stage.stageNumber))
    .map((stage) => ({
      stageNumber: stage.stageNumber,
      endLap: Number(stage.endLap),
    }))
    .filter((stage) => stage.stageNumber > 0 && stage.endLap > 0)
    .sort((a, b) => a.stageNumber - b.stageNumber);
}

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<{
      leagueId: string;
      seriesId: string;
      seasonId: string;
    }>;
  },
) {
  try {
    const params = await context.params;
    const { leagueId, seriesId, seasonId } = params;

    // Verify access
    const accessToken = req.cookies.get("irh_access_token")?.value;

    if (!accessToken) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const iracingCustId = getIracingCustIdFromJwt(accessToken);

    // Get the user
    const user = await prisma.user.findUnique({
      where: { iracingCustId },
      select: { id: true },
    });

    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user is admin/owner of the league
    const membership = await prisma.leagueMembership.findUnique({
      where: {
        userId_leagueId: {
          userId: user.id,
          leagueId,
        },
      },
      select: { owner: true, admin: true },
    });

    if (!membership || (!membership.admin && !membership.owner)) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    // Get schedules for this season, ordered by raceOrder
    const schedules = await prisma.schedule.findMany({
      where: {
        seasonId,
        seriesId,
      },
      orderBy: {
        raceOrder: "asc",
      },
      include: {
        importedSession: {
          select: {
            id: true,
            iracingSessionId: true,
            subsessionId: true,
            hasResults: true,
            trackName: true,
            winnerName: true,
            winnerCustId: true,
            launchAt: true,
            status: true,
            _count: { select: { results: true } },
          },
        },
        registrations: {
          select: {
            id: true,
            member: {
              select: {
                id: true,
                custId: true,
                displayName: true,
                carNumber: true,
                nickName: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
        _count: {
          select: {
            registrations: true,
          },
        },
      },
    });

    return Response.json(schedules);
  } catch (error) {
    console.error("Error fetching schedules:", error);
    return Response.json(
      { error: "failed_to_fetch_schedules" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  context: {
    params: Promise<{
      leagueId: string;
      seriesId: string;
      seasonId: string;
    }>;
  },
) {
  try {
    const params = await context.params;
    const { leagueId, seriesId, seasonId } = params;

    // Verify access
    const accessToken = req.cookies.get("irh_access_token")?.value;

    if (!accessToken) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const iracingCustId = getIracingCustIdFromJwt(accessToken);

    // Get the user
    const user = await prisma.user.findUnique({
      where: { iracingCustId },
      select: { id: true },
    });

    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user is admin/owner of the league
    const membership = await prisma.leagueMembership.findUnique({
      where: {
        userId_leagueId: {
          userId: user.id,
          leagueId,
        },
      },
      select: { owner: true, admin: true },
    });

    if (!membership || (!membership.admin && !membership.owner)) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    const data = (await req.json()) as ScheduleRequest;

    // Verify season exists and belongs to this series
    const season = await prisma.season.findUnique({
      where: { id: seasonId },
    });

    if (!season || season.seriesId !== seriesId) {
      return Response.json({ error: "season_not_found" }, { status: 404 });
    }

    // Create the schedule
    const stages = normalizeStages(data.stages);

    const schedule = await prisma.schedule.create({
      data: {
        seasonId,
        seriesId,
        eventDate: new Date(data.eventDate),
        raceName: data.raceName,
        isOffWeek: data.isOffWeek,
        pointsCount: data.pointsCount,
        canDrop: data.canDrop,
        registrationEnabled: data.registrationEnabled ?? true,
        trackName: data.trackName,
        trackId: data.trackId,
        raceLength: data.raceLength,
        virtualPurse:
          Number.isFinite(data.virtualPurse) && Number(data.virtualPurse) >= 0
            ? Math.floor(Number(data.virtualPurse))
            : 0,
        virtualEntryFee:
          Number.isFinite(data.virtualEntryFee) &&
          Number(data.virtualEntryFee) >= 0
            ? Math.floor(Number(data.virtualEntryFee))
            : 0,
        virtualPayoutSplit: normalizePayoutSplit(
          data.virtualPayoutSplit,
        ) as Prisma.InputJsonValue,
        stages: stages as Prisma.InputJsonValue,
        weather: data.weather as Prisma.InputJsonValue,
        raceOrder: data.raceOrder,
      },
    });

    return Response.json(schedule, { status: 201 });
  } catch (error) {
    console.error("Error creating schedule:", error);
    return Response.json(
      { error: "failed_to_create_schedule" },
      { status: 500 },
    );
  }
}
