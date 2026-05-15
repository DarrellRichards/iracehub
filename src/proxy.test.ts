import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock next/server before importing proxy so NextResponse is controlled
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  next: vi.fn(() => ({ type: "next" })),
  redirect: vi.fn((url: URL) => ({ type: "redirect", url: url.toString() })),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    next: mocks.next,
    redirect: mocks.redirect,
  },
}));

import { proxy } from "./proxy";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRequest(
  pathname: string,
  cookies: Record<string, string> = {},
): import("next/server").NextRequest {
  const url = `http://localhost${pathname}`;

  return {
    nextUrl: { pathname },
    url,
    cookies: {
      get: (name: string) =>
        cookies[name] ? { value: cookies[name] } : undefined,
    },
    headers: {
      get: (_name: string) => null,
    },
  } as unknown as import("next/server").NextRequest;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("proxy middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("public paths — always allowed without authentication", () => {
    const publicPaths = [
      "/",
      "/leagues",
      "/app/122",
      "/app/122/",
      "/app/league-db-id",
      "/app/122/standings",
      "/app/122/standings/",
      "/app/122/calendar",
      "/app/122/calendar/",
    ];

    for (const path of publicPaths) {
      it(`allows ${path}`, async () => {
        const result = await proxy(buildRequest(path));
        expect(result).toEqual({ type: "next" });
        expect(mocks.redirect).not.toHaveBeenCalled();
      });
    }
  });

  describe("protected paths — redirect unauthenticated requests", () => {
    const protectedPaths = [
      "/dashboard",
      "/dashboard/",
      "/app/122/admin",
      "/app/122/teams",
      "/app/122/admin/points-system",
      "/app/drivers/9001",
    ];

    for (const path of protectedPaths) {
      it(`redirects ${path} when no access token`, async () => {
        const result = (await proxy(buildRequest(path))) as {
          type: string;
          url: string;
        };
        expect(result.type).toBe("redirect");
        expect(result.url).toContain("error=unauthenticated");
      });
    }
  });

  it("allows a protected path when access token is present", async () => {
    const result = await proxy(
      buildRequest("/app/122/admin", { irh_access_token: "valid-token" }),
    );
    expect(result).toEqual({ type: "next" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("allows /dashboard when access token is present", async () => {
    const result = await proxy(
      buildRequest("/dashboard", { irh_access_token: "valid-token" }),
    );
    expect(result).toEqual({ type: "next" });
  });

  it("attempts token refresh when refresh token is present but access token is missing", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", mockFetch);

    const result = (await proxy(
      buildRequest("/app/122/admin", { irh_refresh_token: "refresh-token" }),
    )) as { type: string; url: string };

    expect(mockFetch).toHaveBeenCalled();
    // refresh failed → redirect to login
    expect(result.type).toBe("redirect");
    expect(result.url).toContain("error=unauthenticated");

    vi.unstubAllGlobals();
  });
});
