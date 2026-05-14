import { NextRequest, NextResponse } from "next/server";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";
import { prisma } from "@/lib/prisma";
import { seedDefaultPointsSystems } from "@/lib/db/seeds";

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("irh_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // Ensure default systems are seeded
    await seedDefaultPointsSystems();

    // Get all default (global) points systems
    const pointsSystems = await prisma.seriesPointsSystem.findMany({
      where: { leagueId: null },
      select: {
        id: true,
        name: true,
        description: true,
        positionPoints: true,
        bonusPoints: true,
        isDefault: true,
        isPreset: true,
        presetType: true,
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    return NextResponse.json(pointsSystems);
  } catch (error) {
    console.error("[global points systems get]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}
