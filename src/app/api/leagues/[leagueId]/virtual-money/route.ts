import { NextRequest, NextResponse } from "next/server";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";
import { prisma } from "@/lib/prisma";

const PAYOUT_SLOTS = 60;

const normalizePayout = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return Array.from({ length: PAYOUT_SLOTS }, () => 0);
  }

  const normalized = value
    .slice(0, PAYOUT_SLOTS)
    .map((amount) =>
      Number.isFinite(amount) && Number(amount) >= 0
        ? Math.floor(Number(amount))
        : 0,
    );

  while (normalized.length < PAYOUT_SLOTS) {
    normalized.push(0);
  }

  return normalized;
};

const parseNonNegativeInt = (value: unknown) => {
  if (!Number.isInteger(value) || Number(value) < 0) {
    return null;
  }

  return Number(value);
};

async function requireLeagueAdmin(leagueId: string, accessToken: string) {
  const iracingCustId = getIracingCustIdFromJwt(accessToken);

  const user = await prisma.user.findUnique({
    where: { iracingCustId },
    select: { id: true },
  });

  if (!user) {
    return {
      error: NextResponse.json({ error: "user_not_found" }, { status: 404 }),
    };
  }

  const membership = await prisma.leagueMembership.findUnique({
    where: {
      userId_leagueId: {
        userId: user.id,
        leagueId,
      },
    },
    select: { owner: true, admin: true },
  });

  if (!membership || (!membership.owner && !membership.admin)) {
    return {
      error: NextResponse.json(
        { error: "forbidden_not_owner_or_admin" },
        { status: 403 },
      ),
    };
  }

  return { userId: user.id };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;
  const accessToken = request.cookies.get("irh_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const auth = await requireLeagueAdmin(leagueId, accessToken);
    if ("error" in auth) {
      return auth.error;
    }

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: {
        id: true,
        virtualModeEnabled: true,
        virtualBaselinePayout: true,
        virtualEntryFee: true,
        virtualStartingMoney: true,
        virtualIncLimit: true,
        virtualCarReplaceCost: true,
        virtualTeamCost: true,
      },
    });

    if (!league) {
      return NextResponse.json({ error: "league_not_found" }, { status: 404 });
    }

    return NextResponse.json({
      id: league.id,
      virtualModeEnabled: league.virtualModeEnabled,
      virtualBaselinePayout: normalizePayout(league.virtualBaselinePayout),
      virtualEntryFee: league.virtualEntryFee,
      virtualStartingMoney: league.virtualStartingMoney,
      virtualIncLimit: league.virtualIncLimit,
      virtualCarReplaceCost: league.virtualCarReplaceCost,
      virtualTeamCost: league.virtualTeamCost,
    });
  } catch (error) {
    console.error("[virtual-money.get]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}

interface UpdateVirtualMoneyBody {
  virtualModeEnabled?: boolean;
  virtualBaselinePayout?: number[];
  virtualEntryFee?: number;
  virtualStartingMoney?: number;
  virtualIncLimit?: number;
  virtualCarReplaceCost?: number;
  virtualTeamCost?: number;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;
  const accessToken = request.cookies.get("irh_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: UpdateVirtualMoneyBody;
  try {
    body = (await request.json()) as UpdateVirtualMoneyBody;
  } catch {
    return NextResponse.json({ error: "invalid_json_body" }, { status: 400 });
  }

  if (typeof body.virtualModeEnabled !== "boolean") {
    return NextResponse.json(
      { error: "invalid_virtual_mode_enabled" },
      { status: 400 },
    );
  }

  if (
    body.virtualBaselinePayout !== undefined &&
    !Array.isArray(body.virtualBaselinePayout)
  ) {
    return NextResponse.json(
      { error: "invalid_virtual_baseline_payout" },
      { status: 400 },
    );
  }

  const virtualEntryFee = parseNonNegativeInt(body.virtualEntryFee);
  const virtualStartingMoney = parseNonNegativeInt(body.virtualStartingMoney);
  const virtualIncLimit = parseNonNegativeInt(body.virtualIncLimit);
  const virtualCarReplaceCost = parseNonNegativeInt(body.virtualCarReplaceCost);
  const virtualTeamCost = parseNonNegativeInt(body.virtualTeamCost);

  if (
    virtualEntryFee == null ||
    virtualStartingMoney == null ||
    virtualIncLimit == null ||
    virtualCarReplaceCost == null ||
    virtualTeamCost == null
  ) {
    return NextResponse.json(
      { error: "invalid_virtual_money_values" },
      { status: 400 },
    );
  }

  try {
    const auth = await requireLeagueAdmin(leagueId, accessToken);
    if ("error" in auth) {
      return auth.error;
    }

    const existingLeague = await prisma.league.findUnique({
      where: { id: leagueId },
      select: {
        virtualBaselinePayout: true,
      },
    });

    if (!existingLeague) {
      return NextResponse.json({ error: "league_not_found" }, { status: 404 });
    }

    const baselinePayoutSource =
      body.virtualBaselinePayout ?? existingLeague.virtualBaselinePayout;

    const updated = await prisma.league.update({
      where: { id: leagueId },
      data: {
        virtualModeEnabled: body.virtualModeEnabled,
        virtualBaselinePayout: normalizePayout(baselinePayoutSource),
        virtualEntryFee,
        virtualStartingMoney,
        virtualIncLimit,
        virtualCarReplaceCost,
        virtualTeamCost,
      },
      select: {
        id: true,
        virtualModeEnabled: true,
        virtualBaselinePayout: true,
        virtualEntryFee: true,
        virtualStartingMoney: true,
        virtualIncLimit: true,
        virtualCarReplaceCost: true,
        virtualTeamCost: true,
      },
    });

    return NextResponse.json({
      id: updated.id,
      virtualModeEnabled: updated.virtualModeEnabled,
      virtualBaselinePayout: normalizePayout(updated.virtualBaselinePayout),
      virtualEntryFee: updated.virtualEntryFee,
      virtualStartingMoney: updated.virtualStartingMoney,
      virtualIncLimit: updated.virtualIncLimit,
      virtualCarReplaceCost: updated.virtualCarReplaceCost,
      virtualTeamCost: updated.virtualTeamCost,
    });
  } catch (error) {
    console.error("[virtual-money.patch]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}
