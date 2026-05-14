import { NextRequest, NextResponse } from "next/server";
import { fetchIracingLinkedJson, IracingApiError } from "@/lib/iracing/api";

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("irh_access_token")?.value;
  const leagueId = request.nextUrl.searchParams.get("league_id");

  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!leagueId) {
    return NextResponse.json(
      { error: "league_id query parameter is required" },
      { status: 400 },
    );
  }

  try {
    const actualData = await fetchIracingLinkedJson<{
      seasons?: Array<{
        league_id: number;
        season_id: number;
        points_system_id: number;
        season_name: string;
        active: boolean;
        hidden: boolean;
        num_drops: number;
        no_drops_on_or_after_race_num: number;
        points_cars: Array<{ car_id: number; car_name: string }>;
        points_system_name: string;
        points_system_desc: string;
      }>;
      success?: boolean;
    }>(accessToken, `/data/league/seasons?league_id=${leagueId}`);

    return NextResponse.json(actualData.seasons || []);
  } catch (error) {
    if (error instanceof IracingApiError) {
      return NextResponse.json(
        { error: "failed_to_fetch_seasons" },
        { status: error.status },
      );
    }

    console.error("[iracing seasons fetch]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}
