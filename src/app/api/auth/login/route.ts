import { NextResponse } from "next/server";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from "@/lib/auth/pkce";
import { IRACING_CLIENT_ID, REDIRECT_URI } from "@/lib/auth/iracing";

const IRACING_AUTH_URL = "https://oauth.iracing.com/oauth2/authorize";

export async function GET() {
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = generateState();

  const params = new URLSearchParams({
    client_id: IRACING_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    scope: "iracing.auth",
  });

  const authUrl = `${IRACING_AUTH_URL}?${params.toString()}`;

  const res = NextResponse.redirect(authUrl);

  // Store verifier and state in short-lived HTTP-only cookies for the callback
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  };

  res.cookies.set("irh_pkce_verifier", verifier, cookieOpts);
  res.cookies.set("irh_oauth_state", state, cookieOpts);

  return res;
}
