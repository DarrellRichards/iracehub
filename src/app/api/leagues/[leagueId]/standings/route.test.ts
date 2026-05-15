import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    league: {
      findUnique: vi.fn(),
    },
    raceSessionResult: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prisma,
}));

import { GET } from "./route";

function buildRequest(): Request {
  return {} as Request;
}

function mockLeague() {
  mocks.prisma.league.findUnique.mockResolvedValue({
    id: "league-1",
    iracingLeagueId: 101,
    leagueName: "Test League",
  });
}

describe("GET /api/leagues/[leagueId]/standings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when league is not found", async () => {
    mocks.prisma.league.findUnique.mockResolvedValue(null);

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ leagueId: "unknown-league" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "league_not_found",
    });
  });

  it("returns 200 with empty standings for unauthenticated request", async () => {
    mockLeague();
    mocks.prisma.raceSessionResult.findMany.mockResolvedValue([]);

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ leagueId: "league-1" }),
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      league: { id: string; leagueName: string };
      overall: unknown[];
      bySeriesSeason: unknown[];
    };

    expect(payload.league.id).toBe("league-1");
    expect(payload.overall).toEqual([]);
    expect(payload.bySeriesSeason).toEqual([]);
  });

  it("resolves league by numeric iRacing ID", async () => {
    mocks.prisma.league.findUnique.mockResolvedValue({
      id: "league-1",
      iracingLeagueId: 101,
      leagueName: "Test League",
    });
    mocks.prisma.raceSessionResult.findMany.mockResolvedValue([]);

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ leagueId: "101" }),
    });

    expect(response.status).toBe(200);
    // numeric id → findUnique called with iracingLeagueId
    expect(mocks.prisma.league.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { iracingLeagueId: 101 },
      }),
    );
  });

  it("computes overall standings and by-series buckets from results", async () => {
    mockLeague();

    mocks.prisma.raceSessionResult.findMany.mockResolvedValue([
      {
        custId: 1,
        displayName: "Alice",
        finalPoints: 50,
        finishPosition: 1,
        raceSession: {
          series: { id: "series-1", name: "Pro Series" },
          season: { id: "season-1", seasonName: "Season 1" },
        },
      },
      {
        custId: 2,
        displayName: "Bob",
        finalPoints: 40,
        finishPosition: 2,
        raceSession: {
          series: { id: "series-1", name: "Pro Series" },
          season: { id: "season-1", seasonName: "Season 1" },
        },
      },
      {
        custId: 1,
        displayName: "Alice",
        finalPoints: 45,
        finishPosition: 1,
        raceSession: {
          series: { id: "series-1", name: "Pro Series" },
          season: { id: "season-1", seasonName: "Season 1" },
        },
      },
    ]);

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ leagueId: "league-1" }),
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      overall: Array<{
        custId: number;
        points: number;
        wins: number;
        starts: number;
        gapToLeader: number;
      }>;
      bySeriesSeason: Array<{
        seriesId: string;
        seasonId: string;
        standings: unknown[];
      }>;
    };

    // Alice leads with 95 pts (2 wins, 2 starts), Bob has 40 (1 start)
    const [first, second] = payload.overall;
    expect(first.custId).toBe(1);
    expect(first.points).toBe(95);
    expect(first.wins).toBe(2);
    expect(first.starts).toBe(2);
    expect(first.gapToLeader).toBe(0);

    expect(second.custId).toBe(2);
    expect(second.points).toBe(40);
    expect(second.gapToLeader).toBe(55);

    // single series/season bucket
    expect(payload.bySeriesSeason).toHaveLength(1);
    expect(payload.bySeriesSeason[0].seriesId).toBe("series-1");
    expect(payload.bySeriesSeason[0].seasonId).toBe("season-1");
  });

  it("buckets results by series+season", async () => {
    mockLeague();

    mocks.prisma.raceSessionResult.findMany.mockResolvedValue([
      {
        custId: 1,
        displayName: "Alice",
        finalPoints: 50,
        finishPosition: 1,
        raceSession: {
          series: { id: "series-1", name: "Pro Series" },
          season: { id: "season-1", seasonName: "Season 1" },
        },
      },
      {
        custId: 2,
        displayName: "Bob",
        finalPoints: 40,
        finishPosition: 2,
        raceSession: {
          series: { id: "series-2", name: "Amateur Series" },
          season: { id: "season-2", seasonName: "Season 1" },
        },
      },
    ]);

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ leagueId: "league-1" }),
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      bySeriesSeason: Array<{ seriesId: string }>;
    };

    // sorted by seriesName alphabetically: Amateur → Pro
    expect(payload.bySeriesSeason).toHaveLength(2);
    expect(payload.bySeriesSeason[0].seriesId).toBe("series-2");
    expect(payload.bySeriesSeason[1].seriesId).toBe("series-1");
  });
});
