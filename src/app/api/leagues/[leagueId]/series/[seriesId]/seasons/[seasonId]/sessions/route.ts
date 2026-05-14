import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";

function toInputJsonValue(value: Prisma.JsonValue): Prisma.InputJsonValue {
  if (value === null) return null as unknown as Prisma.InputJsonValue;
  return value as Prisma.InputJsonValue;
}

async function assertAdmin(leagueId: string, request: NextRequest) {
  const accessToken = request.cookies.get("irh_access_token")?.value;
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
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      leagueId: string;
      seriesId: string;
      seasonId: string;
    }>;
  },
) {
  const { leagueId, seriesId, seasonId } = await params;

  const auth = await assertAdmin(leagueId, request);
  if (!auth.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  }

  const sessions = await prisma.raceSession.findMany({
    where: { leagueId, seriesId, seasonId },
    orderBy: { launchAt: "asc" },
    include: {
      schedule: {
        select: {
          id: true,
          raceName: true,
          eventDate: true,
          raceOrder: true,
          pointsCount: true,
          canDrop: true,
          stages: true,
        },
      },
      pointsConfig: {
        select: {
          id: true,
          positionPoints: true,
          bonusPoints: true,
          allowProvisionals: true,
        },
      },
      results: {
        orderBy: { finishPosition: "asc" },
        select: {
          id: true,
          custId: true,
          displayName: true,
          finishPosition: true,
          startPosition: true,
          lapsCompleted: true,
          incidents: true,
          provisional: true,
          pointsBase: true,
          stageFinishes: true,
          pointsAdjustment: true,
          finalPoints: true,
          notes: true,
        },
      },
      _count: {
        select: { results: true },
      },
    },
  });

  return NextResponse.json(sessions);
}

/**
 * POST /api/leagues/[leagueId]/series/[seriesId]/seasons/[seasonId]/sessions
 * Creates a placeholder RaceSession linked to a schedule (no iRacing sync required).
 * Body: { scheduleId: string }
 */
export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      leagueId: string;
      seriesId: string;
      seasonId: string;
    }>;
  },
) {
  const { leagueId, seriesId, seasonId } = await params;

  const auth = await assertAdmin(leagueId, request);
  if (!auth.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  }

  const body = (await request.json()) as { scheduleId?: string };
  if (!body.scheduleId) {
    return NextResponse.json({ error: "scheduleId required" }, { status: 400 });
  }

  // Verify the schedule belongs to this season/series
  const schedule = await prisma.schedule.findFirst({
    where: { id: body.scheduleId, seasonId, seriesId },
  });
  if (!schedule) {
    return NextResponse.json({ error: "schedule_not_found" }, { status: 404 });
  }

  // If a session already exists for this schedule, return it
  const existing = await prisma.raceSession.findUnique({
    where: { scheduleId: body.scheduleId },
  });
  if (existing) {
    return NextResponse.json(existing);
  }

  const series = await prisma.series.findFirst({
    where: { id: seriesId, leagueId },
    include: {
      pointsSystem: {
        select: {
          positionPoints: true,
          bonusPoints: true,
        },
      },
    },
  });

  if (!series) {
    return NextResponse.json({ error: "series_not_found" }, { status: 404 });
  }

  const session = await prisma.raceSession.create({
    data: {
      leagueId,
      seriesId,
      seasonId,
      scheduleId: body.scheduleId,
      launchAt: schedule.eventDate,
      rawSession: {},
      pointsConfig: {
        create: {
          positionPoints: toInputJsonValue(series.pointsSystem.positionPoints),
          bonusPoints: toInputJsonValue(series.pointsSystem.bonusPoints),
          allowProvisionals: true,
        },
      },
    },
  });

  return NextResponse.json(session, { status: 201 });
}
