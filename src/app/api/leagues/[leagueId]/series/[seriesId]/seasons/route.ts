import { NextRequest, NextResponse } from "next/server";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string; seriesId: string }> },
) {
  const { seriesId } = await params;
  const accessToken = request.cookies.get("irh_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const seasons = await prisma.season.findMany({
      where: { seriesId },
      orderBy: [{ isSynced: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(seasons);
  } catch (error) {
    console.error("[seasons get]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string; seriesId: string }> },
) {
  const { leagueId, seriesId } = await params;
  const accessToken = request.cookies.get("irh_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const iracingCustId = getIracingCustIdFromJwt(accessToken);
    const body = await request.json();
    const {
      iracingSeasonId,
      seasonName,
      description,
      cars,
      isActive,
      hidden,
      numDrops,
      noDropsOnOrAfterRaceNum,
      iracingPointsSystemId,
      iracingPointsSystemName,
      iracingPointsSystemDesc,
    } = body;

    if (!seasonName || typeof seasonName !== "string" || !seasonName.trim()) {
      return NextResponse.json(
        { error: "invalid_request", message: "seasonName is required" },
        { status: 400 },
      );
    }

    // Verify user is admin/owner
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

    // Verify series exists and belongs to this league
    const series = await prisma.series.findUnique({
      where: { id: seriesId },
      select: { leagueId: true },
    });

    if (!series || series.leagueId !== leagueId) {
      return NextResponse.json({ error: "series_not_found" }, { status: 404 });
    }

    // Check if season already exists (if syncing from iRacing)
    if (iracingSeasonId) {
      const existing = await prisma.season.findUnique({
        where: {
          seriesId_iracingSeasonId: {
            seriesId,
            iracingSeasonId,
          },
        },
      });

      if (existing) {
        return NextResponse.json(
          { error: "season_already_synced" },
          { status: 409 },
        );
      }
    }

    const season = await prisma.season.create({
      data: {
        seriesId,
        iracingSeasonId:
          typeof iracingSeasonId === "number" ? iracingSeasonId : null,
        seasonName: seasonName.trim(),
        description: description || null,
        cars: cars || [],
        isActive: isActive !== false,
        hidden: hidden || false,
        numDrops: numDrops || 0,
        noDropsOnOrAfterRaceNum: noDropsOnOrAfterRaceNum || -1,
        iracingPointsSystemId: iracingPointsSystemId || null,
        iracingPointsSystemName: iracingPointsSystemName || null,
        iracingPointsSystemDesc: iracingPointsSystemDesc || null,
        isSynced: !!iracingSeasonId,
        lastSyncedAt: iracingSeasonId ? new Date() : null,
      },
    });

    console.log("[season create] created season:", season.id);
    return NextResponse.json(season, { status: 201 });
  } catch (error) {
    console.error("[season create]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}
