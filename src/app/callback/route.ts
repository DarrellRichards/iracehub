import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  fetchMemberProfileFromIracing,
  getIracingCustIdFromJwt,
} from "@/lib/auth/iracing";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:2300";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const storedState = request.cookies.get("irh_oauth_state")?.value;
  const verifier = request.cookies.get("irh_pkce_verifier")?.value;

  // Validate state to prevent CSRF attacks
  if (!state || !storedState || state !== storedState) {
    const errorRes = NextResponse.redirect(`${APP_URL}?error=invalid_state`);
    // Clear stale cookies so the next login attempt works cleanly
    errorRes.cookies.delete("irh_pkce_verifier");
    errorRes.cookies.delete("irh_oauth_state");
    return errorRes;
  }

  if (!code || !verifier) {
    return NextResponse.redirect(`${APP_URL}?error=missing_params`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code, verifier);
    const iracingCustId = getIracingCustIdFromJwt(tokens.access_token);
    const profile = await fetchMemberProfileFromIracing(tokens.access_token);

    const user = await prisma.user.upsert({
      where: { iracingCustId },
      create: {
        iracingCustId,
        displayName: profile.displayName,
        country: profile.country,
        memberSince: profile.memberSince,
        lastLoginAt: new Date(),
      },
      update: {
        displayName: profile.displayName,
        country: profile.country,
        memberSince: profile.memberSince,
        lastLoginAt: new Date(),
      },
      select: { id: true },
    });

    const isProduction = process.env.NODE_ENV === "production";
    const tokenCookieOpts = {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax" as const,
      path: "/",
    };

    // access_token expires_in is in seconds; store absolute expiry timestamp
    const expiresAt = Date.now() + tokens.expires_in * 1000;
    // refresh_token_expires_in may be undefined; default to 7 days
    const refreshExpiresAt = tokens.refresh_token_expires_in
      ? Date.now() + tokens.refresh_token_expires_in * 1000
      : Date.now() + 7 * 24 * 60 * 60 * 1000;

    const res = NextResponse.redirect(`${APP_URL}/dashboard`);

    // Clear the temporary PKCE/state cookies
    res.cookies.delete("irh_pkce_verifier");
    res.cookies.delete("irh_oauth_state");

    // Store the access token (HTTP-only)
    res.cookies.set("irh_access_token", tokens.access_token, {
      ...tokenCookieOpts,
      maxAge: tokens.expires_in,
    });

    // Store the refresh token if provided (HTTP-only)
    if (tokens.refresh_token) {
      res.cookies.set("irh_refresh_token", tokens.refresh_token, {
        ...tokenCookieOpts,
        maxAge: tokens.refresh_token_expires_in ?? 7 * 24 * 60 * 60,
      });
    }

    // Client-readable expiry timestamps (not HTTP-only) so the browser can schedule refreshes
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

    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("OAuth callback error:", message);

    const reason = encodeURIComponent(message.slice(0, 160));
    return NextResponse.redirect(
      `${APP_URL}?error=token_exchange_failed&reason=${reason}`,
    );
  }
}
