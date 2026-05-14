import { NextRequest, NextResponse } from "next/server";
import { refreshAccessToken } from "@/lib/auth/iracing";

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get("irh_refresh_token")?.value;

  if (!refreshToken) {
    return NextResponse.json({ error: "no_refresh_token" }, { status: 401 });
  }

  try {
    const tokens = await refreshAccessToken(refreshToken);

    const isProduction = process.env.NODE_ENV === "production";
    const expiresAt = Date.now() + tokens.expires_in * 1000;
    const refreshExpiresAt = tokens.refresh_token_expires_in
      ? Date.now() + tokens.refresh_token_expires_in * 1000
      : Date.now() + 7 * 24 * 60 * 60 * 1000;

    const res = NextResponse.json({ ok: true, expiresAt });

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

    return res;
  } catch (err) {
    console.error("Token refresh error:", err);
    // Clear session so the user is forced to log in again
    const res = NextResponse.json({ error: "refresh_failed" }, { status: 401 });
    res.cookies.delete("irh_access_token");
    res.cookies.delete("irh_refresh_token");
    res.cookies.delete("irh_token_expires_at");
    res.cookies.delete("irh_refresh_expires_at");
    return res;
  }
}
