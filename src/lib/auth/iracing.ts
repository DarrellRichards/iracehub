import crypto from "node:crypto";

const IRACING_TOKEN_URL = "https://oauth.iracing.com/oauth2/token";

export const IRACING_CLIENT_ID = process.env.IRACING_CLIENT_ID ?? "104003-vhub";
const IRACING_CLIENT_SECRET = process.env.IRACING_CLIENT_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:2300";

export const REDIRECT_URI = `${APP_URL}/callback`;

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
}

export interface IracingJwtClaims {
  iracing_cust_id?: number;
}

export interface IracingProfileFields {
  displayName: string | null;
  country: string | null;
  memberSince: Date | null;
}

export interface IracingLeagueRecord {
  league_id: number;
  league_name: string;
  owner_cust_id?: number;
  created?: string;
  hidden?: boolean;
  message?: string;
  about?: string;
  url?: string;
  recruiting?: boolean;
  rules?: string;
  private_wall?: boolean;
  private_roster?: boolean;
  private_schedule?: boolean;
  private_results?: boolean;
  roster_count?: number;
  small_logo?: string;
  large_logo?: string;
}

export interface IracingLeagueMembershipRecord {
  cust_id: number;
  league_id: number;
  owner: boolean;
  admin: boolean;
  league_mail_opt_out?: boolean;
  league_pm_opt_out?: boolean;
  car_number?: string;
  nick_name?: string;
  is_member?: boolean;
  is_applicant?: boolean;
  is_invite?: boolean;
  is_ignored?: boolean;
  league?: IracingLeagueRecord;
}

/**
 * Mask a client_secret per iRacing's algorithm:
 * base64( SHA256( secret + normalized_client_id ) )
 */
function maskSecret(secret: string, clientId: string): string {
  const normalizedId = clientId.trim().toLowerCase();
  return crypto
    .createHash("sha256")
    .update(`${secret}${normalizedId}`)
    .digest("base64");
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: IRACING_CLIENT_ID,
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
  });

  if (IRACING_CLIENT_SECRET) {
    params.set(
      "client_secret",
      maskSecret(IRACING_CLIENT_SECRET, IRACING_CLIENT_ID),
    );
  }

  const res = await fetch(IRACING_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const raw = await res.text();
    try {
      const parsed = JSON.parse(raw) as {
        error?: string;
        error_description?: string;
      };
      const description = parsed.error_description
        ? ` (${parsed.error_description})`
        : "";
      throw new Error(
        `Token exchange failed: ${res.status} ${parsed.error ?? "unknown_error"}${description}`,
      );
    } catch {
      throw new Error(`Token exchange failed: ${res.status} ${raw}`);
    }
  }

  return res.json() as Promise<TokenResponse>;
}

/**
 * Use a refresh token to get a new access token (and possibly new refresh token).
 */
export async function refreshAccessToken(
  refreshToken: string,
): Promise<TokenResponse> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: IRACING_CLIENT_ID,
    refresh_token: refreshToken,
  });

  if (IRACING_CLIENT_SECRET) {
    params.set(
      "client_secret",
      maskSecret(IRACING_CLIENT_SECRET, IRACING_CLIENT_ID),
    );
  }

  const res = await fetch(IRACING_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const raw = await res.text();
    try {
      const parsed = JSON.parse(raw) as {
        error?: string;
        error_description?: string;
      };
      const description = parsed.error_description
        ? ` (${parsed.error_description})`
        : "";
      throw new Error(
        `Token refresh failed: ${res.status} ${parsed.error ?? "unknown_error"}${description}`,
      );
    } catch {
      throw new Error(`Token refresh failed: ${res.status} ${raw}`);
    }
  }

  return res.json() as Promise<TokenResponse>;
}

function decodeBase64Url(value: string): string {
  const padded = value.padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    "=",
  );
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

export function getJwtClaims(token: string): IracingJwtClaims {
  const parts = token.split(".");
  if (parts.length < 2) {
    throw new Error("Invalid JWT format");
  }

  const payloadJson = decodeBase64Url(parts[1]);
  const payload = JSON.parse(payloadJson) as IracingJwtClaims;
  return payload;
}

export function getIracingCustIdFromJwt(token: string): number {
  const claims = getJwtClaims(token);
  const value = claims.iracing_cust_id;

  if (value === undefined || value === null) {
    throw new Error("iracing_cust_id not present in JWT");
  }

  if (!Number.isInteger(value)) {
    throw new Error("iracing_cust_id in JWT is not an integer");
  }

  return value;
}

function parseDateOrNull(input: unknown): Date | null {
  if (typeof input !== "string" || input.trim().length === 0) {
    return null;
  }

  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function fetchMemberProfileFromIracing(
  accessToken: string,
): Promise<IracingProfileFields> {
  const pointerResponse = await fetch(
    "https://members-ng.iracing.com/data/member/profile",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );

  if (!pointerResponse.ok) {
    const text = await pointerResponse.text();
    throw new Error(
      `Failed to fetch profile pointer: ${pointerResponse.status} ${text}`,
    );
  }

  const pointer = (await pointerResponse.json()) as { link?: string };
  if (!pointer.link) {
    throw new Error("Profile pointer response did not include link");
  }

  const profileResponse = await fetch(pointer.link, {
    method: "GET",
    cache: "no-store",
  });

  if (!profileResponse.ok) {
    const text = await profileResponse.text();
    throw new Error(
      `Failed to fetch profile data link: ${profileResponse.status} ${text}`,
    );
  }

  const profileData = (await profileResponse.json()) as {
    member_info?: {
      display_name?: string;
      country?: string;
      member_since?: string;
    };
  };

  return {
    displayName: profileData.member_info?.display_name ?? null,
    country: profileData.member_info?.country ?? null,
    memberSince: parseDateOrNull(profileData.member_info?.member_since),
  };
}

export async function fetchLeagueMembershipsFromIracing(
  accessToken: string,
): Promise<IracingLeagueMembershipRecord[]> {
  const pointerResponse = await fetch(
    "https://members-ng.iracing.com/data/league/membership?include_league=true",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );

  if (!pointerResponse.ok) {
    const text = await pointerResponse.text();
    throw new Error(
      `Failed to fetch league membership pointer: ${pointerResponse.status} ${text}`,
    );
  }

  const pointer = (await pointerResponse.json()) as { link?: string };
  if (!pointer.link) {
    throw new Error("League membership pointer response did not include link");
  }

  const membershipsResponse = await fetch(pointer.link, {
    method: "GET",
    cache: "no-store",
  });

  if (!membershipsResponse.ok) {
    const text = await membershipsResponse.text();
    throw new Error(
      `Failed to fetch league membership data link: ${membershipsResponse.status} ${text}`,
    );
  }

  const memberships =
    (await membershipsResponse.json()) as IracingLeagueMembershipRecord[];
  if (!Array.isArray(memberships)) {
    throw new Error("League membership response was not an array");
  }

  return memberships;
}
