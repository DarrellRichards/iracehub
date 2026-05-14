import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PATHS = ["/dashboard", "/app"];
const EXPIRY_BUFFER_MS = 30 * 1000;

function isNearExpiry(tokenExpiresAt: string | undefined) {
  if (!tokenExpiresAt) return true;
  const ts = Number(tokenExpiresAt);
  if (Number.isNaN(ts)) return true;
  return ts <= Date.now() + EXPIRY_BUFFER_MS;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const accessToken = request.cookies.get("irh_access_token")?.value;
  const refreshToken = request.cookies.get("irh_refresh_token")?.value;
  const tokenExpiresAt = request.cookies.get("irh_token_expires_at")?.value;

  if (refreshToken && (!accessToken || isNearExpiry(tokenExpiresAt))) {
    try {
      const refreshUrl = new URL("/api/auth/refresh", request.url);
      const refreshResponse = await fetch(refreshUrl, {
        method: "POST",
        headers: {
          cookie: request.headers.get("cookie") ?? "",
        },
      });

      if (refreshResponse.ok) {
        const next = NextResponse.next();
        const setCookie = refreshResponse.headers.get("set-cookie");
        if (setCookie) {
          next.headers.append("set-cookie", setCookie);
        }
        return next;
      }
    } catch {
      // ignore and continue with existing auth state
    }
  }

  if (!accessToken) {
    const loginUrl = new URL("/", request.url);
    loginUrl.searchParams.set("error", "unauthenticated");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/app/:path*"],
};
