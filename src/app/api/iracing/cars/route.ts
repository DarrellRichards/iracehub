import { NextRequest, NextResponse } from "next/server";
import { fetchIracingLinkedJson, IracingApiError } from "@/lib/iracing/api";

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("irh_access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const cars = await fetchIracingLinkedJson<
      Array<{
        car_id: number;
        car_name: string;
        retired?: boolean;
      }>
    >(accessToken, "/data/car/get");

    const carNames = cars
      .filter((c) => !c.retired)
      .map((c) => c.car_name)
      .sort((a, b) => a.localeCompare(b));

    return NextResponse.json(carNames);
  } catch (err) {
    if (err instanceof IracingApiError) {
      return NextResponse.json(
        { error: "iracing_fetch_failed" },
        { status: err.status },
      );
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown_error" },
      { status: 500 },
    );
  }
}
