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
    const series = await prisma.series.findMany({
      where: { leagueId },
      select: {
        id: true,
        name: true,
        description: true,
        cars: true,
        isActive: true,
        pointsSystem: {
          select: {
            id: true,
            name: true,
            description: true,
            positionPoints: true,
            bonusPoints: true,
            isDefault: true,
            isPreset: true,
            presetType: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(series);
  } catch (error) {
    console.error("[series get]", error);
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
    const { name, description, cars, pointsSystemId, isActive } = body;

    if (!name || !pointsSystemId || !cars || !Array.isArray(cars)) {
      return NextResponse.json(
        {
          error: "invalid_request",
          message: "name, pointsSystemId, and cars (array) are required",
        },
        { status: 400 },
      );
    }

    const membership = await prisma.leagueMembership.findUnique({
      where: {
        userId_leagueId: {
          userId:
            (
              await prisma.user.findUnique({
                where: { iracingCustId },
                select: { id: true },
              })
            )?.id || "",
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

    const pointsSystem = await prisma.seriesPointsSystem.findUnique({
      where: { id: pointsSystemId },
    });

    if (!pointsSystem) {
      return NextResponse.json(
        { error: "points_system_not_found" },
        { status: 404 },
      );
    }

    if (pointsSystem.leagueId && pointsSystem.leagueId !== leagueId) {
      return NextResponse.json(
        {
          error: "forbidden",
          message: "This points system does not belong to your league",
        },
        { status: 403 },
      );
    }

    const existing = await prisma.series.findFirst({
      where: { leagueId, name },
    });

    if (existing) {
      return NextResponse.json(
        { error: "series_already_exists" },
        { status: 409 },
      );
    }

    const series = await prisma.series.create({
      data: {
        leagueId,
        pointsSystemId,
        name,
        description: description || null,
        cars,
        isActive: isActive !== false,
      },
      select: {
        id: true,
        name: true,
        description: true,
        cars: true,
        isActive: true,
        pointsSystem: {
          select: {
            id: true,
            name: true,
            description: true,
            positionPoints: true,
            bonusPoints: true,
            isDefault: true,
            isPreset: true,
            presetType: true,
          },
        },
        createdAt: true,
        updatedAt: true,
      },
    });

    console.log("[series create] created series:", series.id);
    return NextResponse.json(series, { status: 201 });
  } catch (error) {
    console.error("[series create]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}
