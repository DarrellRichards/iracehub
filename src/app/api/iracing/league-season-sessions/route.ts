import { NextRequest, NextResponse } from "next/server";
import { fetchIracingLinkedJson, IracingApiError } from "@/lib/iracing/api";

interface IracingSeasonSession {
  session_id: number;
  subsession_id: number;
  private_session_id: number;
  launch_at: string;
  league_id: number;
  league_season_id: number;
  race_laps: number;
  race_length: number;
  time_limit: number;
  status: number;
  has_results: boolean;
  winner_id: number;
  winner_name: string;
  track?: {
    track_id?: number;
    track_name?: string;
  };
  track_state?: Record<string, unknown>;
  weather?: Record<string, unknown>;
  cars?: Array<Record<string, unknown>>;
  driver_changes?: boolean;
  entry_count?: number;
  lone_qualify?: boolean;
  password_protected?: boolean;
  practice_length?: number;
  qualify_laps?: number;
  qualify_length?: number;
  team_entry_count?: number;
}

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("irh_access_token")?.value;
  const leagueId = request.nextUrl.searchParams.get("league_id");
  const seasonId = request.nextUrl.searchParams.get("season_id");

  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!leagueId || !seasonId) {
    return NextResponse.json(
      { error: "league_id and season_id query parameters are required" },
      { status: 400 },
    );
  }

  try {
    const data = await fetchIracingLinkedJson<IracingSeasonSession[]>(
      accessToken,
      `/data/league/season_sessions?season_id=${seasonId}&league_id=${leagueId}`,
    );

    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (error) {
    if (error instanceof IracingApiError) {
      return NextResponse.json(
        { error: "failed_to_fetch_season_sessions" },
        { status: error.status },
      );
    }

    console.error("[iracing season sessions fetch]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}
