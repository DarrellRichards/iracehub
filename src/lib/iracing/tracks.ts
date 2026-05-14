import { fetchIracingLinkedJson } from "./api";

export interface Track {
  track_id: number;
  track_name: string;
  track_code: string;
  category: string;
  config_name: string;
  pit_road_speed_limit: number;
  race_week_cars: unknown[];
  retired: boolean;
  logo_url: string;
  website: string;
  active_series: unknown[];
  track_types: unknown[];
}

export async function fetchTracksFromIracing(
  accessToken: string,
): Promise<Track[]> {
  try {
    const tracks = await fetchIracingLinkedJson<Track[]>(
      accessToken,
      "/data/track/get",
    );
    return Array.isArray(tracks) ? tracks : [];
  } catch (error) {
    console.error("Error fetching tracks from iRacing:", error);
    throw error;
  }
}
