import { NextRequest, NextResponse } from "next/server";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";
import { prisma } from "@/lib/prisma";

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
    const pointsSystems = await prisma.seriesPointsSystem.findMany({
      where: {
        OR: [{ leagueId: null }, { leagueId }],
      },
      select: {
        id: true,
        name: true,
        description: true,
        positionPoints: true,
        bonusPoints: true,
        isDefault: true,
        isPreset: true,
        presetType: true,
        leagueId: true,
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    return NextResponse.json(pointsSystems);
  } catch (error) {
    console.error("[points systems get]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;
  const accessToken = request.cookies.get("irh_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const iracingCustId = getIracingCustIdFromJwt(accessToken);
    const body = await request.json();
    const { name, description, positionPoints, bonusPoints } = body;

    if (!name || !positionPoints || typeof positionPoints !== "object") {
      return NextResponse.json(
        {
          error: "invalid_request",
          message:
            "name and positionPoints (object with position->score mapping) are required",
        },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { iracingCustId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
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
      return NextResponse.json(
        { error: "forbidden_not_owner_or_admin" },
        { status: 403 },
      );
    }

    const existing = await prisma.seriesPointsSystem.findFirst({
      where: { leagueId, name },
    });

    if (existing) {
      return NextResponse.json(
        { error: "points_system_already_exists" },
        { status: 409 },
      );
    }

    const pointsSystem = await prisma.seriesPointsSystem.create({
      data: {
        leagueId,
        name,
        description: description || null,
        positionPoints,
        bonusPoints: bonusPoints || {},
        isDefault: false,
        isPreset: false,
      },
      select: {
        id: true,
        name: true,
        description: true,
        positionPoints: true,
        bonusPoints: true,
        isDefault: true,
        isPreset: true,
        leagueId: true,
      },
    });

    console.log(
      "[points system create] created system:",
      pointsSystem.id,
      "for league:",
      leagueId,
    );
    return NextResponse.json(pointsSystem, { status: 201 });
  } catch (error) {
    console.error("[points system create]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}
