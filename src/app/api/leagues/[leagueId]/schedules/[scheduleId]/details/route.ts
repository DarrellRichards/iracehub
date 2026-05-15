import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";

/**
 * PATCH /api/leagues/[leagueId]/schedules/[scheduleId]/details
 * Update schedule details including weather, room open time, and green flag time
 *
 * Request body:
 * {
 *   weather?: { type?: "Set" | "Realistic", temp?: number, humidity?: number, ... },
 *   roomOpenTime?: string (ISO datetime) | null,
 *   greenFlagTime?: string (ISO datetime) | null
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string; scheduleId: string }> },
) {
  try {
    const { leagueId, scheduleId } = await params;
    const accessToken = request.cookies.get("irh_access_token")?.value;

    if (!accessToken) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    try {
      const iracingCustId = getIracingCustIdFromJwt(accessToken);

      // Check if user is league admin
      const user = await prisma.user.findUnique({
        where: { iracingCustId },
        select: {
          id: true,
          leagueMemberships: {
            where: { leagueId },
            select: { admin: true, owner: true },
            take: 1,
          },
        },
      });

      if (!user || !user.leagueMemberships[0]) {
        return NextResponse.json(
          { error: "not_league_member" },
          { status: 403 },
        );
      }

      const membership = user.leagueMemberships[0];
      if (!membership.admin && !membership.owner) {
        return NextResponse.json(
          { error: "insufficient_permissions" },
          { status: 403 },
        );
      }

      // Get and verify schedule belongs to league
      const schedule = await prisma.schedule.findUnique({
        where: { id: scheduleId },
        select: {
          id: true,
          seriesId: true,
          series: { select: { leagueId: true } },
        },
      });

      if (!schedule || schedule.series.leagueId !== leagueId) {
        return NextResponse.json(
          { error: "schedule_not_found" },
          { status: 404 },
        );
      }

      // Parse request body
      const body = (await request.json()) as {
        weather?: Record<string, unknown> | null;
        roomOpenTime?: string | null;
        greenFlagTime?: string | null;
      };

      // Validate datetime fields if provided
      if (body.roomOpenTime !== undefined && body.roomOpenTime !== null) {
        try {
          new Date(body.roomOpenTime);
        } catch {
          return NextResponse.json(
            { error: "invalid_room_open_time" },
            { status: 400 },
          );
        }
      }

      if (body.greenFlagTime !== undefined && body.greenFlagTime !== null) {
        try {
          new Date(body.greenFlagTime);
        } catch {
          return NextResponse.json(
            { error: "invalid_green_flag_time" },
            { status: 400 },
          );
        }
      }

      // Update schedule
      const updateData: Prisma.ScheduleUpdateInput = {};

      if (body.weather !== undefined) {
        updateData.weather = body.weather
          ? (body.weather as Prisma.InputJsonValue)
          : Prisma.JsonNull;
      }
      if (body.roomOpenTime !== undefined) {
        updateData.roomOpenTime = body.roomOpenTime
          ? new Date(body.roomOpenTime)
          : null;
      }
      if (body.greenFlagTime !== undefined) {
        updateData.greenFlagTime = body.greenFlagTime
          ? new Date(body.greenFlagTime)
          : null;
      }

      const updated = await prisma.schedule.update({
        where: { id: scheduleId },
        data: updateData,
        select: {
          id: true,
          eventDate: true,
          raceName: true,
          weather: true,
          roomOpenTime: true,
          greenFlagTime: true,
        },
      });

      return NextResponse.json(updated);
    } catch (err) {
      if (err instanceof Error && err.message.includes("JWT")) {
        return NextResponse.json({ error: "invalid_token" }, { status: 401 });
      }
      throw err;
    }
  } catch (error) {
    console.error("[schedule details route]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "failed_to_update" },
      { status: 500 },
    );
  }
}
