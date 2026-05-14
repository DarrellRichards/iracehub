import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";
import { Prisma } from "@prisma/client";

interface ScheduleUpdateRequest {
  eventDate?: string;
  raceName?: string;
  isOffWeek?: boolean;
  pointsCount?: boolean;
  canDrop?: boolean;
  registrationEnabled?: boolean;
  trackName?: string;
  trackId?: number;
  raceLength?: string;
  virtualPurse?: number;
  virtualEntryFee?: number;
  virtualPayoutSplit?: number[];
  stages?: Array<{ stageNumber: number; endLap: number }>;
  weather?: Record<string, unknown>;
  raceOrder?: number;
}

function normalizePayoutSplit(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((amount) =>
      Number.isFinite(amount) && Number(amount) >= 0
        ? Math.floor(Number(amount))
        : 0,
    )
    .filter((amount) => amount >= 0);
}

function normalizeStages(
  stages: ScheduleUpdateRequest["stages"],
): Array<{ stageNumber: number; endLap: number }> {
  if (!Array.isArray(stages)) return [];

  return stages
    .filter((stage) => Number.isInteger(stage.stageNumber))
    .map((stage) => ({
      stageNumber: stage.stageNumber,
      endLap: Number(stage.endLap),
    }))
    .filter((stage) => stage.stageNumber > 0 && stage.endLap > 0)
    .sort((a, b) => a.stageNumber - b.stageNumber);
}

export async function PATCH(
  req: NextRequest,
  context: {
    params: Promise<{
      leagueId: string;
      seriesId: string;
      seasonId: string;
      scheduleId: string;
    }>;
  },
) {
  try {
    const params = await context.params;
    const { leagueId, seasonId, scheduleId } = params;

    // Verify access
    const accessToken = req.cookies.get("irh_access_token")?.value;

    if (!accessToken) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const iracingCustId = getIracingCustIdFromJwt(accessToken);

    // Get the user
    const user = await prisma.user.findUnique({
      where: { iracingCustId },
      select: { id: true },
    });

    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user is admin/owner of the league
    const membership = await prisma.leagueMembership.findUnique({
      where: {
        userId_leagueId: {
          userId: user.id,
          leagueId,
        },
      },
      select: { owner: true, admin: true },
    });

    if (!membership || (!membership.admin && !membership.owner)) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    // Verify schedule exists
    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule || schedule.seasonId !== seasonId) {
      return Response.json({ error: "schedule_not_found" }, { status: 404 });
    }

    const data = (await req.json()) as ScheduleUpdateRequest;

    // Build update object
    const updateData: Record<string, unknown> = {};
    if (data.eventDate) updateData.eventDate = new Date(data.eventDate);
    if (data.raceName !== undefined) updateData.raceName = data.raceName;
    if (data.isOffWeek !== undefined) updateData.isOffWeek = data.isOffWeek;
    if (data.pointsCount !== undefined)
      updateData.pointsCount = data.pointsCount;
    if (data.canDrop !== undefined) updateData.canDrop = data.canDrop;
    if (data.registrationEnabled !== undefined)
      updateData.registrationEnabled = data.registrationEnabled;
    if (data.trackName !== undefined) updateData.trackName = data.trackName;
    if (data.trackId !== undefined) updateData.trackId = data.trackId;
    if (data.raceLength !== undefined) updateData.raceLength = data.raceLength;
    if (data.virtualPurse !== undefined) {
      updateData.virtualPurse =
        Number.isFinite(data.virtualPurse) && Number(data.virtualPurse) >= 0
          ? Math.floor(Number(data.virtualPurse))
          : 0;
    }
    if (data.virtualEntryFee !== undefined) {
      updateData.virtualEntryFee =
        Number.isFinite(data.virtualEntryFee) &&
        Number(data.virtualEntryFee) >= 0
          ? Math.floor(Number(data.virtualEntryFee))
          : 0;
    }
    if (data.virtualPayoutSplit !== undefined) {
      updateData.virtualPayoutSplit = normalizePayoutSplit(
        data.virtualPayoutSplit,
      ) as Prisma.JsonValue;
    }
    if (data.stages !== undefined)
      updateData.stages = normalizeStages(data.stages) as Prisma.JsonValue;
    if (data.weather !== undefined)
      updateData.weather = data.weather as Prisma.JsonValue;
    if (data.raceOrder !== undefined) updateData.raceOrder = data.raceOrder;

    const updated = await prisma.schedule.update({
      where: { id: scheduleId },
      data: updateData,
    });

    return Response.json(updated);
  } catch (error) {
    console.error("Error updating schedule:", error);
    return Response.json(
      { error: "failed_to_update_schedule" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: {
    params: Promise<{
      leagueId: string;
      seriesId: string;
      seasonId: string;
      scheduleId: string;
    }>;
  },
) {
  try {
    const params = await context.params;
    const { leagueId, seasonId, scheduleId } = params;

    // Verify access
    const accessToken = req.cookies.get("irh_access_token")?.value;

    if (!accessToken) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const iracingCustId = getIracingCustIdFromJwt(accessToken);

    // Get the user
    const user = await prisma.user.findUnique({
      where: { iracingCustId },
      select: { id: true },
    });

    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user is admin/owner of the league
    const membership = await prisma.leagueMembership.findUnique({
      where: {
        userId_leagueId: {
          userId: user.id,
          leagueId,
        },
      },
      select: { owner: true, admin: true },
    });

    if (!membership || (!membership.admin && !membership.owner)) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    // Verify schedule exists
    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule || schedule.seasonId !== seasonId) {
      return Response.json({ error: "schedule_not_found" }, { status: 404 });
    }

    // Delete the schedule
    await prisma.schedule.delete({
      where: { id: scheduleId },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting schedule:", error);
    return Response.json(
      { error: "failed_to_delete_schedule" },
      { status: 500 },
    );
  }
}
