import { describe, expect, it, vi } from "vitest";
import { recalculateLeagueVirtualMoney } from "@/lib/virtualMoneyDistribution";

function createPrismaMock() {
  const memberUpdate = vi.fn(async () => ({}));
  const teamUpdate = vi.fn(async () => ({}));

  return {
    league: { findUnique: vi.fn() },
    member: {
      findMany: vi.fn(),
      update: memberUpdate,
    },
    team: {
      findMany: vi.fn(),
      update: teamUpdate,
    },
    raceSessionResult: { findMany: vi.fn() },
    $transaction: vi.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops)),
  };
}

describe("recalculateLeagueVirtualMoney", () => {
  it("assigns payout directly to non-team members", async () => {
    const prisma = createPrismaMock();
    prisma.league.findUnique.mockResolvedValue({ id: "league-1", virtualModeEnabled: true });
    prisma.member.findMany.mockResolvedValue([
      { id: "member-1", teamMembership: null },
    ]);
    prisma.team.findMany.mockResolvedValue([]);
    prisma.raceSessionResult.findMany.mockResolvedValue([
      {
        memberId: "member-1",
        finishPosition: 1,
        raceSession: { schedule: { virtualPayoutSplit: [100] } },
      },
    ]);

    await recalculateLeagueVirtualMoney(prisma as never, "league-1");

    expect(prisma.member.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "member-1" },
        data: { earnedVirtual: 100 },
      }),
    );
  });

  it("applies team driver payment split and keeps remainder in team bank", async () => {
    const prisma = createPrismaMock();
    prisma.league.findUnique.mockResolvedValue({ id: "league-1", virtualModeEnabled: true });
    prisma.member.findMany.mockResolvedValue([
      { id: "captain", teamMembership: { teamId: "team-1" } },
      { id: "driver", teamMembership: { teamId: "team-1" } },
    ]);
    prisma.team.findMany.mockResolvedValue([
      {
        id: "team-1",
        driverPayments: [{ memberId: "driver", paymentPercent: 50 }],
      },
    ]);
    prisma.raceSessionResult.findMany.mockResolvedValue([
      {
        memberId: "captain",
        finishPosition: 1,
        raceSession: { schedule: { virtualPayoutSplit: [100] } },
      },
    ]);

    await recalculateLeagueVirtualMoney(prisma as never, "league-1");

    expect(prisma.member.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "driver" },
        data: { earnedVirtual: 50 },
      }),
    );
    expect(prisma.member.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "captain" },
        data: { earnedVirtual: 0 },
      }),
    );
    expect(prisma.team.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "team-1" },
        data: { totalEarned: 100, virtualBank: 50 },
      }),
    );
  });

  it("ignores missing payout schedules and keeps balances at zero", async () => {
    const prisma = createPrismaMock();
    prisma.league.findUnique.mockResolvedValue({ id: "league-1", virtualModeEnabled: true });
    prisma.member.findMany.mockResolvedValue([{ id: "member-1", teamMembership: null }]);
    prisma.team.findMany.mockResolvedValue([]);
    prisma.raceSessionResult.findMany.mockResolvedValue([
      {
        memberId: "member-1",
        finishPosition: 1,
        raceSession: { schedule: null },
      },
    ]);

    await recalculateLeagueVirtualMoney(prisma as never, "league-1");

    expect(prisma.member.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "member-1" },
        data: { earnedVirtual: 0 },
      }),
    );
  });

  it("allows payment rules above 100% and reflects over-distribution in team bank", async () => {
    const prisma = createPrismaMock();
    prisma.league.findUnique.mockResolvedValue({ id: "league-1", virtualModeEnabled: true });
    prisma.member.findMany.mockResolvedValue([
      { id: "captain", teamMembership: { teamId: "team-1" } },
      { id: "driver", teamMembership: { teamId: "team-1" } },
    ]);
    prisma.team.findMany.mockResolvedValue([
      {
        id: "team-1",
        driverPayments: [{ memberId: "driver", paymentPercent: 110 }],
      },
    ]);
    prisma.raceSessionResult.findMany.mockResolvedValue([
      {
        memberId: "captain",
        finishPosition: 1,
        raceSession: { schedule: { virtualPayoutSplit: [100] } },
      },
    ]);

    await recalculateLeagueVirtualMoney(prisma as never, "league-1");

    expect(prisma.member.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "driver" },
        data: { earnedVirtual: 110 },
      }),
    );
    expect(prisma.team.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "team-1" },
        data: { totalEarned: 100, virtualBank: -10 },
      }),
    );
  });
});
