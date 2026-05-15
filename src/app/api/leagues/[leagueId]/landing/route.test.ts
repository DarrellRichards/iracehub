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

function mockBaseLeagueAndUser() {
  mocks.getIracingCustIdFromJwt.mockReturnValue(12345);

  mocks.prisma.league.findUnique.mockResolvedValue({
    id: "league-1",
    iracingLeagueId: 101,
    leagueName: "Test League",
    smallLogo: null,
    largeLogo: null,
    rosterCount: 10,
    about: null,
    message: null,
    virtualModeEnabled: false,
    virtualEntryFee: 0,
  });

  mocks.prisma.user.findUnique.mockResolvedValue({
    id: "user-1",
    iracingCustId: 12345,
  });

  mocks.prisma.series.findMany.mockResolvedValue([]);
}

describe("GET /api/leagues/[leagueId]/landing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 for authenticated non-members and disables self-registration", async () => {
    mockBaseLeagueAndUser();
    mocks.prisma.leagueMembership.findUnique.mockResolvedValue(null);
    mocks.prisma.member.findUnique.mockResolvedValue(null);

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ leagueId: "league-1" }),
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      isAdmin: boolean;
      canSelfRegister: boolean;
      series: unknown[];
    };

    expect(payload.isAdmin).toBe(false);
    expect(payload.canSelfRegister).toBe(false);
    expect(payload.series).toEqual([]);
  });

  it("keeps admin and self-registration enabled for valid members", async () => {
    mockBaseLeagueAndUser();
    mocks.prisma.leagueMembership.findUnique.mockResolvedValue({
      owner: false,
      admin: true,
    });
    mocks.prisma.member.findUnique.mockResolvedValue({
      id: "member-1",
      displayName: "Driver One",
    });

    const response = await GET(buildRequest(), {
      params: Promise.resolve({ leagueId: "league-1" }),
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      isAdmin: boolean;
      canSelfRegister: boolean;
    };

    expect(payload.isAdmin).toBe(true);
    expect(payload.canSelfRegister).toBe(true);
  });

  it("returns 200 when access token is missing and keeps actions disabled", async () => {
    mockBaseLeagueAndUser();

    const response = await GET(buildRequest(""), {
      params: Promise.resolve({ leagueId: "league-1" }),
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      isAdmin: boolean;
      canSelfRegister: boolean;
    };

    expect(payload.isAdmin).toBe(false);
    expect(payload.canSelfRegister).toBe(false);
  });
});
