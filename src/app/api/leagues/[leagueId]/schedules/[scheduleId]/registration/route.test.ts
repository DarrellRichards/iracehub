import { beforeEach, describe, expect, it, vi } from "vitest";
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
    eventRegistration: {
      findMany: vi.fn(),
    },
  },
  getIracingCustIdFromJwt: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prisma,
}));

vi.mock("@/lib/auth/iracing", () => ({
  getIracingCustIdFromJwt: mocks.getIracingCustIdFromJwt,
}));

import { GET } from "./route";

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

function mockBaseContext(args?: { admin?: boolean }) {
  const admin = args?.admin ?? false;

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
    earnedVirtual: 0,
  });
  mocks.prisma.schedule.findUnique.mockResolvedValue({
    id: "schedule-1",
    raceName: "Round 1",
    eventDate: new Date("2099-01-01T00:00:00.000Z"),
    registrationEnabled: true,
    virtualEntryFee: 0,
    importedSession: {
      hasResults: false,
    },
    series: {
      leagueId: "league-1",
    },
  });
}

describe("GET /api/leagues/[leagueId]/schedules/[scheduleId]/registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when token is missing", async () => {
    const response = await GET(buildRequest(""), {
      params: Promise.resolve({
        leagueId: "league-1",
        scheduleId: "schedule-1",
      }),
    });

    if (!response) {
      throw new Error("Expected a response");
    }

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

    const response = await GET(buildRequest(), {
      params: Promise.resolve({
        leagueId: "league-1",
        scheduleId: "schedule-1",
      }),
    });

    if (!response) {
      throw new Error("Expected a response");
    }

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "not_a_member" });
  });

  it("hides member registration roster for non-admin members", async () => {
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

    const response = await GET(buildRequest(), {
      params: Promise.resolve({
        leagueId: "league-1",
        scheduleId: "schedule-1",
      }),
    });

    if (!response) {
      throw new Error("Expected a response");
    }

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      isRegistered: boolean;
      registrationCount: number;
      registrations?: unknown[];
    };

    expect(payload.isRegistered).toBe(true);
    expect(payload.registrationCount).toBe(1);
    expect(payload.registrations).toBeUndefined();
  });

  it("includes member registration roster for admins", async () => {
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

    const response = await GET(buildRequest(), {
      params: Promise.resolve({
        leagueId: "league-1",
        scheduleId: "schedule-1",
      }),
    });

    if (!response) {
      throw new Error("Expected a response");
    }

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      registrations?: Array<{ id: string }>;
    };

    expect(payload.registrations).toHaveLength(1);
    expect(payload.registrations?.[0]?.id).toBe("reg-1");
  });
});
