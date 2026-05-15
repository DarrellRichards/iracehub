import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";

async function assertAdmin(leagueId: string, request: NextRequest) {
  const accessToken = request.cookies.get("irh_access_token")?.value;
  if (!accessToken) return { ok: false as const, status: 401 };

  const iracingCustId = getIracingCustIdFromJwt(accessToken);
  const user = await prisma.user.findUnique({
    where: { iracingCustId },
    select: { id: true },
  });
  if (!user) return { ok: false as const, status: 404 };

  const membership = await prisma.leagueMembership.findUnique({
    where: { userId_leagueId: { userId: user.id, leagueId } },
    select: { owner: true, admin: true },
  });
  if (!membership || (!membership.owner && !membership.admin)) {
    return { ok: false as const, status: 403 };
  }

  return { ok: true as const };
}

/**
 * GET /api/leagues/[leagueId]/sessions/lookup?subsessionId=12345
 * Returns any existing RaceSession in this league that matches the given subsessionId.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;

  const auth = await assertAdmin(leagueId, request);
  if (!auth.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  }

  const url = new URL(request.url);
  const subsessionIdStr = url.searchParams.get("subsessionId");
  const subsessionId = subsessionIdStr ? parseInt(subsessionIdStr, 10) : NaN;

  if (isNaN(subsessionId) || subsessionId <= 0) {
    return NextResponse.json(
      { error: "subsessionId query param required" },
      { status: 400 },
    );
  }

  const match = await prisma.raceSession.findFirst({
    where: { leagueId, subsessionId },
    select: {
      id: true,
      subsessionId: true,
      trackName: true,
      launchAt: true,
      hasResults: true,
      schedule: {
        select: {
          raceName: true,
          eventDate: true,
          season: {
            select: {
              seasonName: true,
              series: {
                select: { name: true },
              },
            },
          },
        },
      },
    },
  });

  return NextResponse.json({ match: match ?? null });
}
