import { PermissionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  getIracingCustIdFromJwt,
  refreshAccessToken,
} from "@/lib/auth/iracing";
import { prisma } from "@/lib/prisma";

function isTokenExpiredOrNearExpiry(tokenExpiresAt: string | undefined) {
  if (!tokenExpiresAt) return true;
  const expiresAt = Number(tokenExpiresAt);
  if (Number.isNaN(expiresAt)) return true;
  return expiresAt <= Date.now() + 30 * 1000;
}

function setTokenCookies(
  res: NextResponse,
  tokens: {
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
  },
) {
  const isProduction = process.env.NODE_ENV === "production";
  const expiresAt = Date.now() + tokens.expires_in * 1000;
  const refreshExpiresAt = tokens.refresh_token_expires_in
    ? Date.now() + tokens.refresh_token_expires_in * 1000
    : Date.now() + 7 * 24 * 60 * 60 * 1000;

  const tokenCookieOpts = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
  };

  res.cookies.set("irh_access_token", tokens.access_token, {
    ...tokenCookieOpts,
    maxAge: tokens.expires_in,
  });

  if (tokens.refresh_token) {
    res.cookies.set("irh_refresh_token", tokens.refresh_token, {
      ...tokenCookieOpts,
      maxAge: tokens.refresh_token_expires_in ?? 7 * 24 * 60 * 60,
    });
  }

  res.cookies.set("irh_token_expires_at", String(expiresAt), {
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: tokens.expires_in,
  });

  res.cookies.set("irh_refresh_expires_at", String(refreshExpiresAt), {
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: tokens.refresh_token_expires_in ?? 7 * 24 * 60 * 60,
  });
}

export async function GET(request: NextRequest) {
  let accessToken = request.cookies.get("irh_access_token")?.value;
  const refreshToken = request.cookies.get("irh_refresh_token")?.value;
  const tokenExpiresAt = request.cookies.get("irh_token_expires_at")?.value;
  const refreshExpiresAt = request.cookies.get("irh_refresh_expires_at")?.value;

  let response: NextResponse | null = null;

  if (
    (!accessToken || isTokenExpiredOrNearExpiry(tokenExpiresAt)) &&
    refreshToken
  ) {
    try {
      const refreshed = await refreshAccessToken(refreshToken);
      accessToken = refreshed.access_token;
      response = NextResponse.json(null);
      setTokenCookies(response, refreshed);
    } catch {
      // ignore; fallback to unauthenticated if no valid access token
    }
  }

  if (!accessToken) {
    return NextResponse.json({ authenticated: false });
  }

  let isAdmin = false;

  try {
    const iracingCustId = getIracingCustIdFromJwt(accessToken);
    const userPermission = await prisma.userPermission.findFirst({
      where: {
        user: { iracingCustId },
        permission: PermissionType.ADMIN_ROUTES,
        granted: true,
      },
      select: { id: true },
    });
    isAdmin = Boolean(userPermission);
  } catch {
    isAdmin = false;
  }

  const payload = {
    authenticated: true,
    expiresAt:
      response?.cookies.get("irh_token_expires_at")?.value != null
        ? Number(response.cookies.get("irh_token_expires_at")?.value)
        : tokenExpiresAt
          ? Number(tokenExpiresAt)
          : null,
    refreshExpiresAt: refreshExpiresAt ? Number(refreshExpiresAt) : null,
    isAdmin,
  };

  if (response) {
    response.headers.set("content-type", "application/json");
    response = NextResponse.json(payload, { headers: response.headers });
    setTokenCookies(response, {
      access_token: accessToken,
      expires_in: Math.max(
        1,
        Math.floor(
          ((Number(response.cookies.get("irh_token_expires_at")?.value) ||
            Date.now() + 60_000) -
            Date.now()) /
            1000,
        ),
      ),
    });
    return response;
  }

  return NextResponse.json(payload);
}
