import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";

const REGISTRATION_LOCK_WINDOW_MS = 20 * 60 * 1000;

class InsufficientVirtualFundsError extends Error {
  constructor(
    public readonly available: number,
    public readonly required: number,
  ) {
    super("insufficient_virtual_funds");
  }
}

async function resolveMemberBalance(args: {
  leagueId: string;
  memberId: string;
  earnedVirtual: number;
  virtualStartingMoney: number;
}) {
  const ledger = await prisma.virtualMoneyEvent.aggregate({
    where: {
      leagueId: args.leagueId,
      memberId: args.memberId,
    },
    _sum: {
      amount: true,
    },
  });

  return (
    args.virtualStartingMoney + args.earnedVirtual + (ledger._sum.amount ?? 0)
  );
}

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
    select: { id: true, custId: true, displayName: true, earnedVirtual: true },
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
      virtualEntryFee: true,
      importedSession: {
        select: {
          hasResults: true,
        },
      },
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

function getRegistrationLockReason(args: {
  eventDate: Date;
  registrationEnabled: boolean;
  hasResults: boolean;
}) {
  if (!args.registrationEnabled) {
    return {
      error: "registration_disabled",
      message: "Registration is disabled for this event.",
    };
  }

  if (args.hasResults) {
    return {
      error: "registration_closed_results_posted",
      message:
        "Registration is closed because results have already been posted.",
    };
  }

  const lockTime = new Date(
    new Date(args.eventDate).getTime() - REGISTRATION_LOCK_WINDOW_MS,
  );

  if (Date.now() >= lockTime.getTime()) {
    return {
      error: "registration_closed_starting_soon",
      message: "Registration closes 20 minutes before the event start time.",
    };
  }

  return null;
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
      hasResults: ctx.schedule.importedSession?.hasResults ?? false,
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

  const registrationLock = getRegistrationLockReason({
    eventDate: ctx.schedule.eventDate,
    registrationEnabled: ctx.schedule.registrationEnabled,
    hasResults: ctx.schedule.importedSession?.hasResults ?? false,
  });

  if (registrationLock) {
    return NextResponse.json(registrationLock, { status: 409 });
  }

  const leagueSettings = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      virtualModeEnabled: true,
      virtualStartingMoney: true,
    },
  });

  if (!leagueSettings) {
    return NextResponse.json({ error: "league_not_found" }, { status: 404 });
  }

  const raceEntryFee = Math.max(0, ctx.schedule.virtualEntryFee ?? 0);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.eventRegistration.create({
        data: {
          scheduleId,
          memberId: ctx.member.id,
        },
      });

      if (!leagueSettings.virtualModeEnabled || raceEntryFee <= 0) {
        return;
      }

      const ledger = await tx.virtualMoneyEvent.aggregate({
        where: {
          leagueId,
          memberId: ctx.member.id,
        },
        _sum: {
          amount: true,
        },
      });

      const currentBalance =
        leagueSettings.virtualStartingMoney +
        ctx.member.earnedVirtual +
        (ledger._sum.amount ?? 0);

      if (currentBalance < raceEntryFee) {
        throw new InsufficientVirtualFundsError(currentBalance, raceEntryFee);
      }

      await tx.virtualMoneyEvent.create({
        data: {
          leagueId,
          memberId: ctx.member.id,
          scheduleId,
          eventType: "ENTRY_FEE_DEBIT",
          amount: -raceEntryFee,
          balanceAfter: currentBalance - raceEntryFee,
          note: `Entry fee charged for ${ctx.schedule.raceName}`,
        },
      });
    });
  } catch (error) {
    if (error instanceof InsufficientVirtualFundsError) {
      return NextResponse.json(
        {
          error: "insufficient_virtual_funds",
          message: "Insufficient virtual balance for this race entry fee.",
          required: error.required,
          available: error.available,
        },
        { status: 409 },
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const registrationCount = await prisma.eventRegistration.count({
        where: { scheduleId },
      });

      const currentBalance = await resolveMemberBalance({
        leagueId,
        memberId: ctx.member.id,
        earnedVirtual: ctx.member.earnedVirtual,
        virtualStartingMoney: leagueSettings.virtualStartingMoney,
      });

      return NextResponse.json({
        success: true,
        isRegistered: true,
        registrationCount,
        virtualBalance: currentBalance,
      });
    }

    console.error("[registration.post]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }

  const registrationCount = await prisma.eventRegistration.count({
    where: { scheduleId },
  });

  const currentBalance = await resolveMemberBalance({
    leagueId,
    memberId: ctx.member.id,
    earnedVirtual: ctx.member.earnedVirtual,
    virtualStartingMoney: leagueSettings.virtualStartingMoney,
  });

  return NextResponse.json({
    success: true,
    isRegistered: true,
    registrationCount,
    virtualBalance: currentBalance,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string; scheduleId: string }> },
) {
  const { leagueId, scheduleId } = await params;

  const ctx = await getContext(leagueId, scheduleId, request);
  if ("error" in ctx) return ctx.error;

  const registrationLock = getRegistrationLockReason({
    eventDate: ctx.schedule.eventDate,
    registrationEnabled: ctx.schedule.registrationEnabled,
    hasResults: ctx.schedule.importedSession?.hasResults ?? false,
  });

  if (registrationLock) {
    return NextResponse.json(registrationLock, { status: 409 });
  }

  const leagueSettings = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      virtualModeEnabled: true,
      virtualStartingMoney: true,
    },
  });

  if (!leagueSettings) {
    return NextResponse.json({ error: "league_not_found" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    const deleted = await tx.eventRegistration.deleteMany({
      where: {
        scheduleId,
        memberId: ctx.member.id,
      },
    });

    if (!deleted.count || !leagueSettings.virtualModeEnabled) {
      return;
    }

    const netForSchedule = await tx.virtualMoneyEvent.aggregate({
      where: {
        leagueId,
        memberId: ctx.member.id,
        scheduleId,
      },
      _sum: {
        amount: true,
      },
    });

    const outstandingDebit = Math.max(0, -(netForSchedule._sum.amount ?? 0));
    if (outstandingDebit <= 0) {
      return;
    }

    const totalLedger = await tx.virtualMoneyEvent.aggregate({
      where: {
        leagueId,
        memberId: ctx.member.id,
      },
      _sum: {
        amount: true,
      },
    });

    const currentBalance =
      leagueSettings.virtualStartingMoney +
      ctx.member.earnedVirtual +
      (totalLedger._sum.amount ?? 0);

    await tx.virtualMoneyEvent.create({
      data: {
        leagueId,
        memberId: ctx.member.id,
        scheduleId,
        eventType: "ENTRY_FEE_REFUND",
        amount: outstandingDebit,
        balanceAfter: currentBalance + outstandingDebit,
        note: `Entry fee refunded for ${ctx.schedule.raceName}`,
      },
    });
  });

  const registrationCount = await prisma.eventRegistration.count({
    where: { scheduleId },
  });

  const currentBalance = await resolveMemberBalance({
    leagueId,
    memberId: ctx.member.id,
    earnedVirtual: ctx.member.earnedVirtual,
    virtualStartingMoney: leagueSettings.virtualStartingMoney,
  });

  return NextResponse.json({
    success: true,
    isRegistered: false,
    registrationCount,
    virtualBalance: currentBalance,
  });
}
