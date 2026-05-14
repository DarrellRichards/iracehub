import { NextRequest, NextResponse } from "next/server";
import { fetchIracingLinkedJson, IracingApiError } from "@/lib/iracing/api";

export async function GET(request: NextRequest) {
  try {
    const accessToken = request.cookies.get("irh_access_token")?.value;
    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get("league_id");

    if (!accessToken) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    if (!leagueId) {
      return NextResponse.json(
        { error: "league_id query parameter is required" },
        { status: 400 },
      );
    }

    const leagueData = await fetchIracingLinkedJson<{
      roster?: unknown[];
    }>(accessToken, `/data/league/get?league_id=${leagueId}`);

    return NextResponse.json(leagueData.roster || []);
  } catch (error) {
    if (error instanceof IracingApiError) {
      return NextResponse.json(
        { error: "failed_to_fetch_members" },
        { status: error.status },
      );
    }

    console.error("Error fetching league members:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
