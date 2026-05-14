import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";

function resolvePositionPoints(
  positionPoints: Prisma.JsonValue,
  finishPosition?: number | null,
): number {
  if (!finishPosition || finishPosition < 1) return 0;
  if (!positionPoints || typeof positionPoints !== "object") return 0;

  const asMap = positionPoints as Record<string, unknown>;
  const value = asMap[String(finishPosition)];
  return typeof value === "number" ? value : 0;
}

function parseStageFinishes(stageFinishes: Prisma.JsonValue | null): number[] {
  if (!Array.isArray(stageFinishes)) return [];

  return stageFinishes
    .map((finish) => Number(finish))
    .filter((finish) => Number.isInteger(finish) && finish > 0);
}

function resolveStageBonusPoints(
  bonusPoints: Prisma.JsonValue,
  stageFinishes: number[],
  stageCount: number,
): number {
  if (!bonusPoints || typeof bonusPoints !== "object") return 0;

  const asMap = bonusPoints as Record<string, unknown>;
  const stageWinBonus = typeof asMap.stageWin === "number" ? asMap.stageWin : 0;

  const finishesToScore =
    stageCount > 0 ? stageFinishes.slice(0, stageCount) : stageFinishes;

  return finishesToScore.reduce((total, finishPosition) => {
    const pointsForFinish = asMap[`stageFinish${finishPosition}`];
    const finishBonus =
      typeof pointsForFinish === "number" ? pointsForFinish : 0;
    const winBonus = finishPosition === 1 ? stageWinBonus : 0;

    return total + finishBonus + winBonus;
  }, 0);
}

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

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      leagueId: string;
      seriesId: string;
      seasonId: string;
      raceSessionId: string;
    }>;
  },
) {
  const { leagueId, seriesId, seasonId, raceSessionId } = await params;

  const auth = await assertAdmin(leagueId, request);
  if (!auth.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  }

  const raceSession = await prisma.raceSession.findFirst({
    where: {
      id: raceSessionId,
      leagueId,
      seriesId,
      seasonId,
    },
    include: {
      pointsConfig: true,
      schedule: { select: { pointsCount: true, stages: true } },
      series: {
        include: {
          pointsSystem: {
            select: {
              positionPoints: true,
              bonusPoints: true,
            },
          },
        },
      },
    },
  });

  if (!raceSession) {
    return NextResponse.json(
      { error: "race_session_not_found" },
      { status: 404 },
    );
  }

  let positionPoints = raceSession.pointsConfig?.positionPoints ?? null;

  // Self-heal points config if session was created without one
  if (!positionPoints) {
    await prisma.raceSessionPoints.upsert({
      where: { raceSessionId },
      create: {
        raceSessionId,
        positionPoints: toInputJsonValue(
          raceSession.series.pointsSystem.positionPoints,
        ),
        bonusPoints: toInputJsonValue(
          raceSession.series.pointsSystem.bonusPoints,
        ),
        allowProvisionals: true,
      },
      update: {
        positionPoints: toInputJsonValue(
          raceSession.series.pointsSystem.positionPoints,
        ),
        bonusPoints: toInputJsonValue(
          raceSession.series.pointsSystem.bonusPoints,
        ),
      },
    });

    positionPoints = raceSession.series.pointsSystem.positionPoints;
  }

  const shouldCountPoints = raceSession.schedule?.pointsCount ?? true;
  const stageCount = Array.isArray(raceSession.schedule?.stages)
    ? raceSession.schedule.stages.length
    : 0;

  const existingResults = await prisma.raceSessionResult.findMany({
    where: { raceSessionId },
    select: {
      id: true,
      finishPosition: true,
      stageFinishes: true,
      pointsAdjustment: true,
    },
  });

  if (existingResults.length === 0) {
    return NextResponse.json({
      updated: 0,
      pointsCountApplied: shouldCountPoints,
    });
  }

  await prisma.$transaction(
    existingResults.map((result) => {
      const stageFinishes = parseStageFinishes(result.stageFinishes);
      const pointsBase = shouldCountPoints
        ? resolvePositionPoints(positionPoints ?? {}, result.finishPosition) +
          resolveStageBonusPoints(
            raceSession.pointsConfig?.bonusPoints ??
              raceSession.series.pointsSystem.bonusPoints,
            stageFinishes,
            stageCount,
          )
        : 0;
      const finalPoints = pointsBase + (result.pointsAdjustment ?? 0);

      return prisma.raceSessionResult.update({
        where: { id: result.id },
        data: {
          pointsBase,
          finalPoints,
        },
      });
    }),
  );

  return NextResponse.json({
    updated: existingResults.length,
    pointsCountApplied: shouldCountPoints,
  });
}
