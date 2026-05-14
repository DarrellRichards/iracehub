import { NextRequest, NextResponse } from "next/server";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";
import { prisma } from "@/lib/prisma";

export async function PATCH(
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
    const { name, description, cars, pointsSystemId, isActive } = body;

    // Get user to verify membership
    const user = await prisma.user.findUnique({
      where: { iracingCustId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    // Check if user is admin or owner of the league
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
    const existingSeries = await prisma.series.findUnique({
      where: { id: seriesId },
    });

    if (!existingSeries || existingSeries.leagueId !== leagueId) {
      return NextResponse.json({ error: "series_not_found" }, { status: 404 });
    }

    // If updating points system, verify it exists and belongs to league or is global
    if (pointsSystemId) {
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
    }

    // If changing name, check for duplicates
    if (name && name !== existingSeries.name) {
      const duplicate = await prisma.series.findFirst({
        where: {
          leagueId,
          name,
          id: { not: seriesId },
        },
      });

      if (duplicate) {
        return NextResponse.json(
          { error: "series_already_exists" },
          { status: 409 },
        );
      }
    }

    // Update the series
    const updatedSeries = await prisma.series.update({
      where: { id: seriesId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description: description || null }),
        ...(cars && { cars }),
        ...(pointsSystemId && { pointsSystemId }),
        ...(isActive !== undefined && { isActive }),
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

    console.log("[series update] updated series:", seriesId);
    return NextResponse.json(updatedSeries);
  } catch (error) {
    console.error("[series update]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
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

    // Get user to verify membership
    const user = await prisma.user.findUnique({
      where: { iracingCustId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    // Check if user is admin or owner of the league
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
    });

    if (!series || series.leagueId !== leagueId) {
      return NextResponse.json({ error: "series_not_found" }, { status: 404 });
    }

    // Delete the series
    await prisma.series.delete({
      where: { id: seriesId },
    });

    console.log("[series delete] deleted series:", seriesId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[series delete]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}
