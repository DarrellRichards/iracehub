import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";

interface UpdateResultRequest {
  displayName?: string;
  finishPosition?: number | null;
  stageFinishes?: number[];
  startPosition?: number | null;
  lapsCompleted?: number | null;
  incidents?: number | null;
  provisional?: boolean;
  pointsAdjustment?: number;
  notes?: string | null;
}

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

function normalizeStageFinishes(stageFinishes?: number[]): number[] {
  if (!Array.isArray(stageFinishes)) return [];

  return stageFinishes
    .map((finish) => Number(finish))
    .filter((finish) => Number.isInteger(finish) && finish > 0);
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

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      leagueId: string;
      raceSessionId: string;
      resultId: string;
      seasonId: string;
      seriesId: string;
    }>;
  },
) {
  const { leagueId, raceSessionId, resultId } = await params;

  const auth = await assertAdmin(leagueId, request);
  if (!auth.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  }

  const data = (await request.json()) as UpdateResultRequest;

  const existingResult = await prisma.raceSessionResult.findFirst({
    where: {
      id: resultId,
      raceSessionId,
      raceSession: {
        leagueId,
      },
    },
    include: {
      raceSession: {
        include: {
          pointsConfig: true,
          schedule: { select: { pointsCount: true, stages: true } },
        },
      },
    },
  });

  if (!existingResult) {
    return NextResponse.json({ error: "result_not_found" }, { status: 404 });
  }

  const mergedFinishPosition =
    data.finishPosition === undefined
      ? existingResult.finishPosition
      : data.finishPosition;
  const mergedAdjustment =
    data.pointsAdjustment ?? existingResult.pointsAdjustment;
  const mergedStageFinishes =
    data.stageFinishes === undefined
      ? parseStageFinishes(existingResult.stageFinishes)
      : normalizeStageFinishes(data.stageFinishes);
  const stageCount = Array.isArray(existingResult.raceSession.schedule?.stages)
    ? existingResult.raceSession.schedule.stages.length
    : 0;

  const pointsBase = existingResult.raceSession.schedule?.pointsCount
    ? resolvePositionPoints(
        existingResult.raceSession.pointsConfig?.positionPoints ?? {},
        mergedFinishPosition,
      ) +
      resolveStageBonusPoints(
        existingResult.raceSession.pointsConfig?.bonusPoints ?? {},
        mergedStageFinishes,
        stageCount,
      )
    : 0;

  const updated = await prisma.raceSessionResult.update({
    where: { id: resultId },
    data: {
      displayName: data.displayName,
      finishPosition:
        data.finishPosition === undefined ? undefined : data.finishPosition,
      stageFinishes:
        data.stageFinishes === undefined
          ? undefined
          : (mergedStageFinishes as Prisma.InputJsonValue),
      startPosition:
        data.startPosition === undefined ? undefined : data.startPosition,
      lapsCompleted:
        data.lapsCompleted === undefined ? undefined : data.lapsCompleted,
      incidents: data.incidents === undefined ? undefined : data.incidents,
      provisional: data.provisional,
      pointsBase,
      pointsAdjustment: mergedAdjustment,
      finalPoints: pointsBase + mergedAdjustment,
      notes: data.notes === undefined ? undefined : data.notes,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      leagueId: string;
      raceSessionId: string;
      resultId: string;
      seasonId: string;
      seriesId: string;
    }>;
  },
) {
  const { leagueId, raceSessionId, resultId } = await params;

  const auth = await assertAdmin(leagueId, request);
  if (!auth.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  }

  const existingResult = await prisma.raceSessionResult.findFirst({
    where: {
      id: resultId,
      raceSessionId,
      raceSession: {
        leagueId,
      },
    },
    select: { id: true },
  });

  if (!existingResult) {
    return NextResponse.json({ error: "result_not_found" }, { status: 404 });
  }

  await prisma.raceSessionResult.delete({ where: { id: resultId } });
  return NextResponse.json({ success: true });
}
