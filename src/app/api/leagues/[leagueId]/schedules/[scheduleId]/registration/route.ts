import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";

async function getContext(
  leagueId: string,
  scheduleId: string,
  request: NextRequest,
) {
  const accessToken = request.cookies.get("irh_access_token")?.value;
  if (!accessToken) {
    return {
      error: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  const iracingCustId = getIracingCustIdFromJwt(accessToken);
  const user = await prisma.user.findUnique({
    where: { iracingCustId },
    select: { id: true, iracingCustId: true },
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

  if (!membership) {
    return {
      error: NextResponse.json({ error: "not_a_member" }, { status: 403 }),
    };
  }

  const member = await prisma.member.findUnique({
    where: {
      leagueId_custId: {
        leagueId,
        custId: user.iracingCustId,
      },
    },
    select: { id: true, custId: true, displayName: true },
  });

  if (!member) {
    return {
      error: NextResponse.json(
        {
          error: "member_not_synced",
          message: "Please sync league members first.",
        },
        { status: 404 },
      ),
    };
  }

  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    select: {
      id: true,
      raceName: true,
      eventDate: true,
      registrationEnabled: true,
      series: {
        select: {
          leagueId: true,
        },
      },
    },
  });

  if (!schedule || schedule.series.leagueId !== leagueId) {
    return {
      error: NextResponse.json(
        { error: "schedule_not_found" },
        { status: 404 },
      ),
    };
  }

  return {
    user,
    member,
    schedule,
    isAdmin: membership.owner || membership.admin,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string; scheduleId: string }> },
) {
  const { leagueId, scheduleId } = await params;

  const ctx = await getContext(leagueId, scheduleId, request);
  if ("error" in ctx) return ctx.error;

  const registrations = await prisma.eventRegistration.findMany({
    where: { scheduleId },
    include: {
      member: {
        select: {
          id: true,
          custId: true,
          displayName: true,
          carNumber: true,
          nickName: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const isRegistered = registrations.some((r) => r.memberId === ctx.member.id);

  return NextResponse.json({
    schedule: {
      id: ctx.schedule.id,
      raceName: ctx.schedule.raceName,
      eventDate: ctx.schedule.eventDate,
      registrationEnabled: ctx.schedule.registrationEnabled,
    },
    isRegistered,
    registrationCount: registrations.length,
    registrations: ctx.isAdmin
      ? registrations.map((r) => ({
          id: r.id,
          createdAt: r.createdAt,
          member: r.member,
        }))
      : undefined,
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string; scheduleId: string }> },
) {
  const { leagueId, scheduleId } = await params;

  const ctx = await getContext(leagueId, scheduleId, request);
  if ("error" in ctx) return ctx.error;

  if (!ctx.schedule.registrationEnabled) {
    return NextResponse.json(
      { error: "registration_disabled" },
      { status: 409 },
    );
  }

  await prisma.eventRegistration.upsert({
    where: {
      scheduleId_memberId: {
        scheduleId,
        memberId: ctx.member.id,
      },
    },
    create: {
      scheduleId,
      memberId: ctx.member.id,
    },
    update: {},
  });

  const registrationCount = await prisma.eventRegistration.count({
    where: { scheduleId },
  });

  return NextResponse.json({
    success: true,
    isRegistered: true,
    registrationCount,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string; scheduleId: string }> },
) {
  const { leagueId, scheduleId } = await params;

  const ctx = await getContext(leagueId, scheduleId, request);
  if ("error" in ctx) return ctx.error;

  await prisma.eventRegistration.deleteMany({
    where: {
      scheduleId,
      memberId: ctx.member.id,
    },
  });

  const registrationCount = await prisma.eventRegistration.count({
    where: { scheduleId },
  });

  return NextResponse.json({
    success: true,
    isRegistered: false,
    registrationCount,
  });
}
