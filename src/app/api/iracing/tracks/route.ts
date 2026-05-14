import { cookies } from "next/headers";
import { fetchTracksFromIracing } from "@/lib/iracing/tracks";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("irh_access_token")?.value;

    if (!accessToken) {
      return Response.json(
        { error: "unauthorized", message: "No access token found" },
        { status: 401 },
      );
    }

    const tracks = await fetchTracksFromIracing(accessToken);

    return Response.json(tracks);
  } catch (error) {
    console.error("Error fetching tracks:", error);

    const message =
      error instanceof Error ? error.message : "Failed to fetch tracks";

    return Response.json(
      {
        error: "failed_to_fetch_tracks",
        message,
      },
      { status: 500 },
    );
  }
}
