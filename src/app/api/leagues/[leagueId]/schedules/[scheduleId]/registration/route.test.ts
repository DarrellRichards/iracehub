import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    leagueMembership: {
      findUnique: vi.fn(),
    },
    member: {
      findUnique: vi.fn(),
    },
    schedule: {
      findUnique: vi.fn(),
    },
    league: {
      findUnique: vi.fn(),
    },
    eventRegistration: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    virtualMoneyEvent: {
      aggregate: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  getIracingCustIdFromJwt: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prisma,
}));

vi.mock("@/lib/auth/iracing", () => ({
  getIracingCustIdFromJwt: mocks.getIracingCustIdFromJwt,
}));

import { DELETE, GET, POST } from "./route";

function buildRequest(accessToken = "token"): NextRequest {
  return {
    cookies: {
      get: vi.fn((name: string) =>
        name === "irh_access_token" && accessToken
          ? { value: accessToken }
          : undefined,
      ),
    },
  } as unknown as NextRequest;
}

const params = Promise.resolve({
  leagueId: "league-1",
  scheduleId: "schedule-1",
});

function mockBaseContext(args?: {
  admin?: boolean;
  hasResults?: boolean;
  registrationEnabled?: boolean;
  eventDate?: string;
  virtualEntryFee?: number;
}) {
  const admin = args?.admin ?? false;
  const hasResults = args?.hasResults ?? false;
  const registrationEnabled = args?.registrationEnabled ?? true;
  const eventDate =
    args?.eventDate ?? new Date(Date.now() + 1000 * 60 * 60).toISOString();
  const virtualEntryFee = args?.virtualEntryFee ?? 0;

  mocks.getIracingCustIdFromJwt.mockReturnValue(9001);
  mocks.prisma.user.findUnique.mockResolvedValue({
    id: "user-1",
    iracingCustId: 9001,
  });
  mocks.prisma.leagueMembership.findUnique.mockResolvedValue({
    owner: false,
    admin,
  });
  mocks.prisma.member.findUnique.mockResolvedValue({
    id: "member-1",
    custId: 9001,
    displayName: "Driver One",
    earnedVirtual: 10,
  });
  mocks.prisma.schedule.findUnique.mockResolvedValue({
    id: "schedule-1",
    raceName: "Round 1",
    eventDate: new Date(eventDate),
    registrationEnabled,
    virtualEntryFee,
    importedSession: {
      hasResults,
    },
    series: {
      leagueId: "league-1",
    },
  });
}

function p2002Error() {
  const error = Object.create(
    Prisma.PrismaClientKnownRequestError.prototype,
  ) as Prisma.PrismaClientKnownRequestError;
  Object.assign(error, { code: "P2002" });
  return error;
}

describe("registration route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("returns 401 when token is missing", async () => {
      const response = await GET(buildRequest(""), { params });
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
    });

    it("returns 403 when requester is not a league member", async () => {
      mocks.getIracingCustIdFromJwt.mockReturnValue(9001);
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        iracingCustId: 9001,
      });
      mocks.prisma.leagueMembership.findUnique.mockResolvedValue(null);

      const response = await GET(buildRequest(), { params });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: "not_a_member" });
    });

    it("hides registration roster for non-admin members", async () => {
      mockBaseContext({ admin: false });
      mocks.prisma.eventRegistration.findMany.mockResolvedValue([
        {
          id: "reg-1",
          memberId: "member-1",
          createdAt: new Date("2099-01-01T00:00:00.000Z"),
          member: {
            id: "member-1",
            custId: 9001,
            displayName: "Driver One",
            carNumber: null,
            nickName: null,
          },
        },
      ]);

      const response = await GET(buildRequest(), { params });
      const payload = (await response.json()) as {
        isRegistered: boolean;
        registrationCount: number;
        registrations?: unknown[];
      };

      expect(response.status).toBe(200);
      expect(payload.isRegistered).toBe(true);
      expect(payload.registrationCount).toBe(1);
      expect(payload.registrations).toBeUndefined();
    });

    it("includes registration roster for admins", async () => {
      mockBaseContext({ admin: true });
      mocks.prisma.eventRegistration.findMany.mockResolvedValue([
        {
          id: "reg-1",
          memberId: "member-1",
          createdAt: new Date("2099-01-01T00:00:00.000Z"),
          member: {
            id: "member-1",
            custId: 9001,
            displayName: "Driver One",
            carNumber: null,
            nickName: null,
          },
        },
      ]);

      const response = await GET(buildRequest(), { params });
      const payload = (await response.json()) as {
        registrations?: Array<{ id: string }>;
      };

      expect(response.status).toBe(200);
      expect(payload.registrations).toHaveLength(1);
      expect(payload.registrations?.[0]?.id).toBe("reg-1");
    });
  });

  describe("POST", () => {
    it("returns 409 when registration is disabled", async () => {
      mockBaseContext({ registrationEnabled: false });

      const response = await POST(buildRequest(), { params });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: "registration_disabled",
      });
    });

    it("returns 409 when event has started", async () => {
      mockBaseContext({
        eventDate: new Date(Date.now() - 1000 * 60).toISOString(),
      });

      const response = await POST(buildRequest(), { params });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: "event_passed",
      });
    });

    it("returns 404 when league settings are missing", async () => {
      mockBaseContext();
      mocks.prisma.league.findUnique.mockResolvedValue(null);

      const response = await POST(buildRequest(), { params });
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: "league_not_found",
      });
    });

    it("registers successfully without virtual mode charges", async () => {
      mockBaseContext({ virtualEntryFee: 50 });
      mocks.prisma.league.findUnique.mockResolvedValue({
        virtualModeEnabled: false,
        virtualStartingMoney: 100,
      });
      mocks.prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => unknown) =>
          fn({
            eventRegistration: { create: vi.fn() },
            virtualMoneyEvent: { aggregate: vi.fn(), create: vi.fn() },
          }),
      );
      mocks.prisma.eventRegistration.count.mockResolvedValue(3);
      mocks.prisma.virtualMoneyEvent.aggregate.mockResolvedValue({
        _sum: { amount: 5 },
      });

      const response = await POST(buildRequest(), { params });
      const payload = (await response.json()) as {
        success: boolean;
        isRegistered: boolean;
        registrationCount: number;
        virtualBalance: number;
      };

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.isRegistered).toBe(true);
      expect(payload.registrationCount).toBe(3);
      expect(payload.virtualBalance).toBe(115);
    });

    it("returns 409 for insufficient virtual funds", async () => {
      mockBaseContext({ virtualEntryFee: 200 });
      mocks.prisma.league.findUnique.mockResolvedValue({
        virtualModeEnabled: true,
        virtualStartingMoney: 100,
      });

      const txEventCreate = vi.fn();
      const txLedgerAggregate = vi
        .fn()
        .mockResolvedValue({ _sum: { amount: 0 } });
      mocks.prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => unknown) =>
          fn({
            eventRegistration: { create: vi.fn() },
            virtualMoneyEvent: {
              aggregate: txLedgerAggregate,
              create: txEventCreate,
            },
          }),
      );

      const response = await POST(buildRequest(), { params });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: "insufficient_virtual_funds",
      });
      expect(txEventCreate).not.toHaveBeenCalled();
    });

    it("returns success when duplicate registration error occurs", async () => {
      mockBaseContext({ virtualEntryFee: 0 });
      mocks.prisma.league.findUnique.mockResolvedValue({
        virtualModeEnabled: false,
        virtualStartingMoney: 100,
      });
      mocks.prisma.$transaction.mockRejectedValue(p2002Error());
      mocks.prisma.eventRegistration.count.mockResolvedValue(2);
      mocks.prisma.virtualMoneyEvent.aggregate.mockResolvedValue({
        _sum: { amount: 20 },
      });

      const response = await POST(buildRequest(), { params });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        success: true,
        isRegistered: true,
        registrationCount: 2,
        virtualBalance: 130,
      });
    });

    it("returns 500 for unknown transaction failures", async () => {
      mockBaseContext();
      mocks.prisma.league.findUnique.mockResolvedValue({
        virtualModeEnabled: false,
        virtualStartingMoney: 100,
      });
      mocks.prisma.$transaction.mockRejectedValue(new Error("boom"));

      const response = await POST(buildRequest(), { params });
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: "internal_server_error",
      });
    });
  });

  describe("DELETE", () => {
    it("returns 409 when results are posted", async () => {
      mockBaseContext({ hasResults: true });

      const response = await DELETE(buildRequest(), { params });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: "registration_closed_results_posted",
      });
    });

    it("returns 404 when league settings are missing", async () => {
      mockBaseContext();
      mocks.prisma.league.findUnique.mockResolvedValue(null);

      const response = await DELETE(buildRequest(), { params });
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual({
        error: "league_not_found",
      });
    });

    it("unregisters successfully and refunds outstanding debit", async () => {
      mockBaseContext();
      mocks.prisma.league.findUnique.mockResolvedValue({
        virtualModeEnabled: true,
        virtualStartingMoney: 100,
      });

      const txDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
      const txAggregate = vi
        .fn()
        .mockResolvedValueOnce({ _sum: { amount: -25 } })
        .mockResolvedValueOnce({ _sum: { amount: -10 } });
      const txCreate = vi.fn();

      mocks.prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => unknown) =>
          fn({
            eventRegistration: { deleteMany: txDeleteMany },
            virtualMoneyEvent: {
              aggregate: txAggregate,
              create: txCreate,
            },
          }),
      );

      mocks.prisma.eventRegistration.count.mockResolvedValue(1);
      mocks.prisma.virtualMoneyEvent.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      });

      const response = await DELETE(buildRequest(), { params });
      const payload = (await response.json()) as {
        success: boolean;
        isRegistered: boolean;
      };

      expect(response.status).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.isRegistered).toBe(false);
      expect(txCreate).toHaveBeenCalled();
    });

    it("unregisters with no refund when nothing was debited", async () => {
      mockBaseContext();
      mocks.prisma.league.findUnique.mockResolvedValue({
        virtualModeEnabled: true,
        virtualStartingMoney: 100,
      });

      const txCreate = vi.fn();
      mocks.prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => unknown) =>
          fn({
            eventRegistration: {
              deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
            },
            virtualMoneyEvent: {
              aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } }),
              create: txCreate,
            },
          }),
      );

      mocks.prisma.eventRegistration.count.mockResolvedValue(0);
      mocks.prisma.virtualMoneyEvent.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      });

      const response = await DELETE(buildRequest(), { params });

      expect(response.status).toBe(200);
      expect(txCreate).not.toHaveBeenCalled();
    });
  });
});
