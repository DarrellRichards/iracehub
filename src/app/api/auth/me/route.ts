import { NextRequest, NextResponse } from "next/server";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";

/**
 * GET /api/auth/me
 * Get current user's iRacing custId
 */
export async function GET(request: NextRequest) {
  try {
    const accessToken = request.cookies.get("irh_access_token")?.value;

    if (!accessToken) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const custId = getIracingCustIdFromJwt(accessToken);

    if (!custId) {
      return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }

    return NextResponse.json({
      custId,
    });
  } catch (error) {
    console.error("[auth.me]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}
