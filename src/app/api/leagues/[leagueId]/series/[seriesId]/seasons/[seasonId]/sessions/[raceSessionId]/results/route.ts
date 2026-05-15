import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";
import { recalculateLeagueVirtualMoney } from "@/lib/virtualMoneyDistribution";

const PAYOUT_SLOTS = 60;

interface UpsertResultRequest {
  custId: number;
  displayName: string;
  finishPosition?: number;
  stageFinishes?: number[];
  startPosition?: number;
  lapsCompleted?: number;
  incidents?: number;
  provisional?: boolean;
  pointsAdjustment?: number;
  notes?: string;
}

function resolvePositionPoints(
  positionPoints: Prisma.JsonValue,
  finishPosition?: number,
): number {
  if (!finishPosition || finishPosition < 1) return 0;
  if (!positionPoints || typeof positionPoints !== "object") return 0;

  const asMap = positionPoints as Record<string, unknown>;
  const value = asMap[String(finishPosition)];
  return typeof value === "number" ? value : 0;
}

function normalizeStageFinishes(
  stageFinishes: UpsertResultRequest["stageFinishes"],
): number[] {
  if (!Array.isArray(stageFinishes)) return [];

  return stageFinishes
    .map((finish) => Number(finish))
    .filter((finish) => Number.isInteger(finish) && finish > 0);
}

function normalizePayout(value: Prisma.JsonValue | null): number[] {
  if (!Array.isArray(value)) {
    return Array.from({ length: PAYOUT_SLOTS }, () => 0);
  }

  const normalized = value
    .slice(0, PAYOUT_SLOTS)
    .map((amount) =>
      typeof amount === "number" && amount >= 0 ? Math.floor(amount) : 0,
    );

  while (normalized.length < PAYOUT_SLOTS) {
    normalized.push(0);
  }

  return normalized;
}

function resolveRaceEarnings(
  finishPosition: number | null,
  args: {
    virtualModeEnabled: boolean;
    schedulePayoutSplit: Prisma.JsonValue | null;
  },
): number | null {
  if (!args.virtualModeEnabled) {
    return null;
  }

  const payout = normalizePayout(args.schedulePayoutSplit);
  const basePayout =
    finishPosition != null &&
    finishPosition >= 1 &&
    finishPosition <= PAYOUT_SLOTS
      ? (payout[finishPosition - 1] ?? 0)
      : 0;

  return basePayout;
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

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      leagueId: string;
      raceSessionId: string;
      seasonId: string;
      seriesId: string;
    }>;
  },
) {
  const { leagueId, raceSessionId } = await params;

  const auth = await assertAdmin(leagueId, request);
  if (!auth.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  }

  const raceSession = await prisma.raceSession.findFirst({
    where: { id: raceSessionId, leagueId },
    include: {
      pointsConfig: true,
      schedule: {
        select: {
          pointsCount: true,
          virtualPayoutSplit: true,
        },
      },
      results: {
        orderBy: [{ finishPosition: "asc" }, { displayName: "asc" }],
      },
    },
  });

  if (!raceSession) {
    return NextResponse.json(
      { error: "race_session_not_found" },
      { status: 404 },
    );
  }

  const leagueVirtualSettings = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      virtualModeEnabled: true,
    },
  });

  const virtualSettings = leagueVirtualSettings ?? {
    virtualModeEnabled: false,
  };

  return NextResponse.json({
    ...raceSession,
    results: raceSession.results.map((result) => ({
      ...result,
      virtualEarnings: resolveRaceEarnings(result.finishPosition, {
        ...virtualSettings,
        schedulePayoutSplit: raceSession.schedule?.virtualPayoutSplit ?? [],
      }),
    })),
  });
}

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      leagueId: string;
      raceSessionId: string;
      seasonId: string;
      seriesId: string;
    }>;
  },
) {
  const { leagueId, raceSessionId } = await params;

  const auth = await assertAdmin(leagueId, request);
  if (!auth.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  }

  const data = (await request.json()) as UpsertResultRequest;

  if (!Number.isInteger(data.custId)) {
    return NextResponse.json({ error: "invalid_cust_id" }, { status: 400 });
  }

  if (!data.displayName?.trim()) {
    return NextResponse.json(
      { error: "display_name_required" },
      { status: 400 },
    );
  }

  const raceSession = await prisma.raceSession.findFirst({
    where: { id: raceSessionId, leagueId },
    include: {
      pointsConfig: true,
      schedule: { select: { pointsCount: true, stages: true } },
    },
  });

  if (!raceSession) {
    return NextResponse.json(
      { error: "race_session_not_found" },
      { status: 404 },
    );
  }

  const stageFinishes = normalizeStageFinishes(data.stageFinishes);
  const stageCount = Array.isArray(raceSession.schedule?.stages)
    ? raceSession.schedule.stages.length
    : 0;

  const pointsBase = raceSession.schedule?.pointsCount
    ? resolvePositionPoints(
        raceSession.pointsConfig?.positionPoints ?? {},
        data.finishPosition,
      ) +
      resolveStageBonusPoints(
        raceSession.pointsConfig?.bonusPoints ?? {},
        stageFinishes,
        stageCount,
      )
    : 0;

  const adjustment = data.pointsAdjustment ?? 0;
  const finalPoints = pointsBase + adjustment;

  const member = await prisma.member.findUnique({
    where: {
      leagueId_custId: {
        leagueId,
        custId: data.custId,
      },
    },
    select: { id: true },
  });

  if (data.provisional && !member) {
    return NextResponse.json(
      { error: "provisional_member_must_exist_in_league" },
      { status: 400 },
    );
  }

  const result = await prisma.raceSessionResult.upsert({
    where: {
      raceSessionId_custId: {
        raceSessionId,
        custId: data.custId,
      },
    },
    create: {
      raceSessionId,
      memberId: member?.id,
      custId: data.custId,
      displayName: data.displayName,
      finishPosition: data.finishPosition,
      stageFinishes: stageFinishes as Prisma.InputJsonValue,
      startPosition: data.startPosition,
      lapsCompleted: data.lapsCompleted,
      incidents: data.incidents,
      provisional: data.provisional ?? false,
      pointsBase,
      pointsAdjustment: adjustment,
      finalPoints,
      notes: data.notes,
    },
    update: {
      memberId: member?.id,
      displayName: data.displayName,
      finishPosition: data.finishPosition,
      stageFinishes: stageFinishes as Prisma.InputJsonValue,
      startPosition: data.startPosition,
      lapsCompleted: data.lapsCompleted,
      incidents: data.incidents,
      provisional: data.provisional ?? false,
      pointsBase,
      pointsAdjustment: adjustment,
      finalPoints,
      notes: data.notes,
    },
  });

  await recalculateLeagueVirtualMoney(prisma, leagueId);

  return NextResponse.json(result);
}
