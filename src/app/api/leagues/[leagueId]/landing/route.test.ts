import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  prisma: {
    league: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    leagueMembership: {
      findUnique: vi.fn(),
    },
    member: {
      findUnique: vi.fn(),
    },
    leagueJoinRequest: {
      findFirst: vi.fn(),
    },
    series: {
      findMany: vi.fn(),
    },
    schedule: {
      findFirst: vi.fn(),
    },
    raceSession: {
      findFirst: vi.fn(),
    },
    raceSessionResult: {
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

function mockLeague(overrides?: Partial<any>) {
  mocks.prisma.league.findUnique.mockResolvedValue({
    id: "league-1",
    iracingLeagueId: 101,
    leagueName: "Test League",
    smallLogo: null,
    largeLogo: null,
    rosterCount: 10,
    about: null,
    message: null,
    recruitingOpen: true,
    recruitingSeries: [
      {
        series: {
          id: "s-1",
          name: "GT3",
        },
      },
    ],
    virtualModeEnabled: true,
    virtualEntryFee: 0,
    ...overrides,
  });
}

function mockAuthUser(admin = false, memberSynced = true) {
  mocks.getIracingCustIdFromJwt.mockReturnValue(12345);
  mocks.prisma.user.findUnique.mockResolvedValue({
    id: "user-1",
    iracingCustId: 12345,
    displayName: "Driver One",
    country: "US",
  });
  mocks.prisma.leagueMembership.findUnique.mockResolvedValue({
    owner: false,
    admin,
  });
  mocks.prisma.member.findUnique.mockResolvedValue(
    memberSynced
      ? {
          id: "member-1",
          displayName: "Driver One",
        }
      : null,
  );
}

describe("GET /api/leagues/[leagueId]/landing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.series.findMany.mockResolvedValue([]);
    mocks.prisma.leagueJoinRequest.findFirst.mockResolvedValue(null);
  });

  it("returns 404 when league does not exist", async () => {
    mocks.prisma.league.findUnique.mockResolvedValue(null);

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ leagueId: "missing" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "league_not_found",
    });
  });

  it("returns 200 for authenticated non-members and disables self-registration", async () => {
    mockLeague();
    mockAuthUser(false, false);

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ leagueId: "league-1" }),
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      isAdmin: boolean;
      canSelfRegister: boolean;
      isLeagueMember: boolean;
      series: unknown[];
    };

    expect(payload.isAdmin).toBe(false);
    expect(payload.canSelfRegister).toBe(false);
    expect(payload.isLeagueMember).toBe(false);
    expect(payload.series).toEqual([]);
  });

  it("keeps admin and self-registration enabled for valid members", async () => {
    mockLeague();
    mockAuthUser(true, true);

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ leagueId: "league-1" }),
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      isAdmin: boolean;
      canSelfRegister: boolean;
      isLeagueMember: boolean;
      viewer: { iracingCustId: number } | null;
    };

    expect(payload.isAdmin).toBe(true);
    expect(payload.canSelfRegister).toBe(true);
    expect(payload.isLeagueMember).toBe(true);
    expect(payload.viewer?.iracingCustId).toBe(12345);
  });

  it("returns 200 when access token decode fails", async () => {
    mockLeague();
    mocks.getIracingCustIdFromJwt.mockImplementation(() => {
      throw new Error("bad token");
    });

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ leagueId: "league-1" }),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      isAdmin: boolean;
      viewer: unknown;
    };
    expect(payload.isAdmin).toBe(false);
    expect(payload.viewer).toBeNull();
  });

  it("builds next event, last race, standings, and registration visibility", async () => {
    mockLeague({ virtualModeEnabled: true });
    mockAuthUser(true, true);

    mocks.prisma.leagueJoinRequest.findFirst.mockResolvedValue({
      id: "jr-1",
      status: "PENDING",
      createdAt: new Date("2099-01-01T00:00:00.000Z"),
      requestedSeries: [{ series: { id: "s-1", name: "GT3" } }],
    });

    mocks.prisma.series.findMany.mockResolvedValue([
      {
        id: "series-1",
        name: "GT3 Series",
        description: "desc",
        seasons: [
          {
            id: "season-1",
            seasonName: "Season 1",
            description: "S1",
            iracingSeasonId: 55,
          },
        ],
      },
    ]);

    mocks.prisma.schedule.findFirst.mockResolvedValue({
      id: "schedule-1",
      eventDate: new Date("2099-02-01T00:00:00.000Z"),
      raceName: "Race 1",
      isOffWeek: false,
      pointsCount: true,
      canDrop: false,
      registrationEnabled: true,
      trackName: "Road Atlanta",
      trackId: 1,
      raceLength: "30 laps",
      raceOrder: 1,
      iracingSessionId: null,
      weather: {},
      roomOpenTime: null,
      greenFlagTime: null,
      importedSession: null,
      registrations: [
        {
          id: "reg-1",
          memberId: "member-1",
          createdAt: new Date("2099-01-31T00:00:00.000Z"),
          member: {
            id: "member-1",
            custId: 12345,
            displayName: "Driver One",
            carNumber: "7",
            nickName: "One",
          },
        },
      ],
    });

    mocks.prisma.raceSession.findFirst.mockResolvedValue({
      id: "rs-1",
      launchAt: new Date("2099-01-01T00:00:00.000Z"),
      trackName: "undefined",
      winnerName: "Winner",
      winnerCustId: 12345,
      iracingSessionId: 1,
      subsessionId: 2,
      schedule: {
        id: "schedule-last",
        raceName: "Last Race",
        eventDate: new Date("2099-01-01T00:00:00.000Z"),
        raceOrder: 3,
        trackName: "Spa",
        virtualPayoutSplit: [100, 50, 25],
      },
      results: [
        {
          id: "r-1",
          custId: 12345,
          displayName: "Driver One",
          finishPosition: 1,
          startPosition: 2,
          lapsCompleted: 20,
          incidents: 0,
          finalPoints: 55,
          provisional: false,
        },
      ],
    });

    mocks.prisma.raceSessionResult.findMany.mockResolvedValue([
      {
        custId: 12345,
        displayName: "Driver One",
        finalPoints: 90,
        finishPosition: 1,
      },
      {
        custId: 54321,
        displayName: "Driver Two",
        finalPoints: 70,
        finishPosition: 2,
      },
    ]);

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ leagueId: "league-1" }),
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      currentJoinRequest: { id: string } | null;
      series: Array<{
        nextEvent: {
          registrationCount: number;
          isRegisteredByMe: boolean;
        } | null;
        lastRaceResult: {
          trackName: string | null;
          results: Array<{ virtualEarnings: number | null }>;
        } | null;
        standings: Array<{ gapToLeader: number }>;
      }>;
    };

    expect(payload.currentJoinRequest?.id).toBe("jr-1");
    expect(payload.series).toHaveLength(1);
    expect(payload.series[0]?.nextEvent?.registrationCount).toBe(1);
    expect(payload.series[0]?.nextEvent?.isRegisteredByMe).toBe(true);
    expect(payload.series[0]?.lastRaceResult?.trackName).toBe("Spa");
    expect(payload.series[0]?.lastRaceResult?.results[0]?.virtualEarnings).toBe(
      100,
    );
    expect(payload.series[0]?.standings[0]?.gapToLeader).toBe(0);
  });

  it("returns 500 when an unexpected error occurs", async () => {
    mocks.prisma.league.findUnique.mockRejectedValue(new Error("db failed"));

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ leagueId: "league-1" }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "failed_to_load_landing",
    });
  });
});
