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
    series: {
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

function buildRequest(accessToken?: string): NextRequest {
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

function mockLeague() {
  mocks.prisma.league.findUnique.mockResolvedValue({
    id: "league-1",
    iracingLeagueId: 101,
  });
}

const FUTURE_DATE = new Date("2099-06-01T18:00:00.000Z");

function makeSchedule(overrides = {}) {
  return {
    id: "schedule-1",
    eventDate: FUTURE_DATE,
    raceName: "Round 1",
    isOffWeek: false,
    pointsCount: true,
    canDrop: false,
    registrationEnabled: true,
    trackName: null,
    trackId: null,
    raceLength: null,
    raceOrder: 1,
    iracingSessionId: null,
    importedSession: null,
    registrations: [],
    ...overrides,
  };
}

function mockSeriesWithSchedule(overrides = {}) {
  mocks.prisma.series.findMany.mockResolvedValue([
    {
      id: "series-1",
      name: "Pro Series",
      description: null,
      isActive: true,
      seasons: [
        {
          id: "season-1",
          seasonName: "Season 1",
          description: null,
          isActive: true,
          numDrops: 0,
          iracingSeasonId: null,
          schedules: [makeSchedule(overrides)],
        },
      ],
    },
  ]);
}

describe("GET /api/leagues/[leagueId]/calendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when league is not found", async () => {
    mocks.prisma.league.findUnique.mockResolvedValue(null);

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ leagueId: "unknown" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "league_not_found",
    });
  });

  it("returns 200 with isAdmin=false and isRegisteredByMe=false for unauthenticated request", async () => {
    mockLeague();
    mockSeriesWithSchedule();

    const response = await GET(buildRequest(/* no token */), {
      params: Promise.resolve({ leagueId: "101" }),
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      isAdmin: boolean;
      series: Array<{
        seasons: Array<{
          schedules: Array<{
            isRegisteredByMe: boolean;
            registeredMembers: unknown[];
          }>;
        }>;
      }>;
    };

    expect(payload.isAdmin).toBe(false);
    const schedule = payload.series[0].seasons[0].schedules[0];
    expect(schedule.isRegisteredByMe).toBe(false);
    expect(schedule.registeredMembers).toEqual([]);
  });

  it("returns isAdmin=false and isRegisteredByMe=false when auth token is invalid", async () => {
    mockLeague();
    mockSeriesWithSchedule();
    mocks.getIracingCustIdFromJwt.mockImplementation(() => {
      throw new Error("invalid token");
    });

    const response = await GET(buildRequest("bad-token"), {
      params: Promise.resolve({ leagueId: "league-1" }),
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      isAdmin: boolean;
    };

    expect(payload.isAdmin).toBe(false);
  });

  it("returns isAdmin=true for league admin and shows registered members", async () => {
    mockLeague();

    const member = {
      id: "member-1",
      custId: 9001,
      displayName: "Driver One",
      carNumber: "42",
      nickName: null,
    };

    mocks.prisma.series.findMany.mockResolvedValue([
      {
        id: "series-1",
        name: "Pro Series",
        description: null,
        isActive: true,
        seasons: [
          {
            id: "season-1",
            seasonName: "Season 1",
            description: null,
            isActive: true,
            numDrops: 0,
            iracingSeasonId: null,
            schedules: [
              makeSchedule({
                registrations: [
                  {
                    id: "reg-1",
                    createdAt: FUTURE_DATE,
                    memberId: "member-1",
                    member,
                  },
                ],
              }),
            ],
          },
        ],
      },
    ]);

    mocks.getIracingCustIdFromJwt.mockReturnValue(9001);
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      iracingCustId: 9001,
    });
    mocks.prisma.leagueMembership.findUnique.mockResolvedValue({
      owner: false,
      admin: true,
    });
    mocks.prisma.member.findUnique.mockResolvedValue({
      id: "member-1",
    });

    const response = await GET(buildRequest("valid-token"), {
      params: Promise.resolve({ leagueId: "league-1" }),
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      isAdmin: boolean;
      series: Array<{
        seasons: Array<{
          schedules: Array<{
            isRegisteredByMe: boolean;
            registeredMembers: Array<{ id: string }>;
          }>;
        }>;
      }>;
    };

    expect(payload.isAdmin).toBe(true);
    const schedule = payload.series[0].seasons[0].schedules[0];
    expect(schedule.isRegisteredByMe).toBe(true);
    expect(schedule.registeredMembers).toHaveLength(1);
    expect(schedule.registeredMembers[0].id).toBe("reg-1");
  });

  it("hides registeredMembers for non-admin authenticated member", async () => {
    mockLeague();

    mocks.prisma.series.findMany.mockResolvedValue([
      {
        id: "series-1",
        name: "Pro Series",
        description: null,
        isActive: true,
        seasons: [
          {
            id: "season-1",
            seasonName: "Season 1",
            description: null,
            isActive: true,
            numDrops: 0,
            iracingSeasonId: null,
            schedules: [
              makeSchedule({
                registrations: [
                  {
                    id: "reg-1",
                    createdAt: FUTURE_DATE,
                    memberId: "member-1",
                    member: {
                      id: "member-1",
                      custId: 9001,
                      displayName: "Driver One",
                      carNumber: null,
                      nickName: null,
                    },
                  },
                ],
              }),
            ],
          },
        ],
      },
    ]);

    mocks.getIracingCustIdFromJwt.mockReturnValue(9001);
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      iracingCustId: 9001,
    });
    mocks.prisma.leagueMembership.findUnique.mockResolvedValue({
      owner: false,
      admin: false,
    });
    mocks.prisma.member.findUnique.mockResolvedValue({ id: "member-1" });

    const response = await GET(buildRequest("valid-token"), {
      params: Promise.resolve({ leagueId: "league-1" }),
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      isAdmin: boolean;
      series: Array<{
        seasons: Array<{
          schedules: Array<{ registeredMembers: unknown[] }>;
        }>;
      }>;
    };

    expect(payload.isAdmin).toBe(false);
    expect(payload.series[0].seasons[0].schedules[0].registeredMembers).toEqual(
      [],
    );
  });
});
