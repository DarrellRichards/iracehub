import { PrismaClient } from "@prisma/client";

const PAYOUT_SLOTS = 60;

function normalizePayout(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return Array.from({ length: PAYOUT_SLOTS }, () => 0);
  }

  const normalized = value
    .slice(0, PAYOUT_SLOTS)
    .map((amount) =>
      typeof amount === "number" && amount >= 0 ? Math.floor(amount) : 0,
    );

  while (normalized.length < PAYOUT_SLOTS) {
    normalized.push(0);
  }

  return normalized;
}

function resolveRaceEarnings(
  finishPosition: number | null,
  args: {
    virtualModeEnabled: boolean;
    schedulePayoutSplit: unknown;
  },
): number {
  if (!args.virtualModeEnabled) {
    return 0;
  }

  const payout = normalizePayout(args.schedulePayoutSplit);
  const basePayout =
    finishPosition != null &&
    finishPosition >= 1 &&
    finishPosition <= PAYOUT_SLOTS
      ? (payout[finishPosition - 1] ?? 0)
      : 0;

  return basePayout;
}

export async function recalculateLeagueVirtualMoney(
  prisma: PrismaClient,
  leagueId: string,
) {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      virtualModeEnabled: true,
    },
  });

  if (!league) {
    return;
  }

  const [members, teams, raceResults] = await Promise.all([
    prisma.member.findMany({
      where: { leagueId },
      select: {
        id: true,
        teamMembership: {
          select: {
            teamId: true,
          },
        },
      },
    }),
    prisma.team.findMany({
      where: { leagueId },
      select: {
        id: true,
        driverPayments: {
          select: {
            memberId: true,
            paymentPercent: true,
          },
        },
      },
    }),
    prisma.raceSessionResult.findMany({
      where: {
        raceSession: {
          leagueId,
          hasResults: true,
        },
      },
      select: {
        memberId: true,
        finishPosition: true,
        raceSession: {
          select: {
            schedule: {
              select: {
                virtualPayoutSplit: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const memberEarned = new Map<string, number>();
  for (const member of members) {
    memberEarned.set(member.id, 0);
  }

  const teamBank = new Map<string, number>();
  const teamTotalEarned = new Map<string, number>();
  const teamDriverPayments = new Map<
    string,
    Array<{ memberId: string; paymentPercent: number }>
  >();

  for (const team of teams) {
    teamBank.set(team.id, 0);
    teamTotalEarned.set(team.id, 0);
    teamDriverPayments.set(team.id, team.driverPayments);
  }

  const teamIdByMemberId = new Map<string, string>();
  for (const member of members) {
    const teamId = member.teamMembership?.teamId;
    if (teamId) {
      teamIdByMemberId.set(member.id, teamId);
    }
  }

  for (const result of raceResults) {
    if (!result.memberId) {
      continue;
    }

    const earnings = resolveRaceEarnings(result.finishPosition, {
      virtualModeEnabled: league.virtualModeEnabled,
      schedulePayoutSplit:
        result.raceSession.schedule?.virtualPayoutSplit ?? [],
    });

    if (earnings === 0) {
      continue;
    }

    const teamId = teamIdByMemberId.get(result.memberId);

    if (!teamId) {
      memberEarned.set(
        result.memberId,
        (memberEarned.get(result.memberId) ?? 0) + earnings,
      );
      continue;
    }

    teamTotalEarned.set(teamId, (teamTotalEarned.get(teamId) ?? 0) + earnings);
    teamBank.set(teamId, (teamBank.get(teamId) ?? 0) + earnings);

    if (earnings <= 0) {
      continue;
    }

    const payments = teamDriverPayments.get(teamId) ?? [];
    if (payments.length === 0) {
      continue;
    }

    let distributed = 0;
    for (const payment of payments) {
      const payout = Math.floor((earnings * payment.paymentPercent) / 100);
      if (payout <= 0) {
        continue;
      }

      memberEarned.set(
        payment.memberId,
        (memberEarned.get(payment.memberId) ?? 0) + payout,
      );
      distributed += payout;
    }

    teamBank.set(teamId, (teamBank.get(teamId) ?? 0) - distributed);
  }

  await prisma.$transaction([
    ...members.map((member) =>
      prisma.member.update({
        where: { id: member.id },
        data: { earnedVirtual: memberEarned.get(member.id) ?? 0 },
      }),
    ),
    ...teams.map((team) =>
      prisma.team.update({
        where: { id: team.id },
        data: {
          totalEarned: teamTotalEarned.get(team.id) ?? 0,
          virtualBank: teamBank.get(team.id) ?? 0,
        },
      }),
    ),
  ]);
}
