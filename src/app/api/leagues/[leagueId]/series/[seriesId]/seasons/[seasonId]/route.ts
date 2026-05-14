import { NextRequest, NextResponse } from "next/server";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";
import { prisma } from "@/lib/prisma";

export async function PATCH(
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
  const accessToken = request.cookies.get("irh_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const iracingCustId = getIracingCustIdFromJwt(accessToken);
    const body = await request.json();
    const {
      seasonName,
      description,
      cars,
      isActive,
      hidden,
      numDrops,
      noDropsOnOrAfterRaceNum,
    } = body;

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

    // Verify season belongs to the correct series
    const season = await prisma.season.findUnique({
      where: { id: seasonId },
      select: { seriesId: true },
    });

    if (!season || season.seriesId !== seriesId) {
      return NextResponse.json({ error: "season_not_found" }, { status: 404 });
    }

    const updatedSeason = await prisma.season.update({
      where: { id: seasonId },
      data: {
        ...(seasonName && { seasonName }),
        ...(description !== undefined && { description: description || null }),
        ...(cars && { cars }),
        ...(isActive !== undefined && { isActive }),
        ...(hidden !== undefined && { hidden }),
        ...(numDrops !== undefined && { numDrops }),
        ...(noDropsOnOrAfterRaceNum !== undefined && {
          noDropsOnOrAfterRaceNum,
        }),
      },
    });

    console.log("[season update] updated season:", seasonId);
    return NextResponse.json(updatedSeason);
  } catch (error) {
    console.error("[season update]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
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
  const accessToken = request.cookies.get("irh_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const iracingCustId = getIracingCustIdFromJwt(accessToken);

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

    // Verify season belongs to the correct series
    const season = await prisma.season.findUnique({
      where: { id: seasonId },
      select: { seriesId: true },
    });

    if (!season || season.seriesId !== seriesId) {
      return NextResponse.json({ error: "season_not_found" }, { status: 404 });
    }

    await prisma.season.delete({
      where: { id: seasonId },
    });

    console.log("[season delete] deleted season:", seasonId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[season delete]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}
