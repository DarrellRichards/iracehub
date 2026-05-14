import { NextRequest, NextResponse } from "next/server";
import { fetchLeagueMembershipsFromIracing } from "@/lib/auth/iracing";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("irh_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const memberships = await fetchLeagueMembershipsFromIracing(accessToken);
    console.log("Fetched memberships from iRacing:", memberships);
    const eligibleMemberships = memberships.filter(
      (membership) =>
        membership.league && (membership.owner || membership.admin),
    );

    const leagueIds = eligibleMemberships
      .map((membership) => membership.league_id)
      .filter((leagueId) => Number.isInteger(leagueId));

    const existingLeagues = leagueIds.length
      ? await prisma.league.findMany({
          where: { iracingLeagueId: { in: leagueIds } },
          select: { id: true, iracingLeagueId: true },
        })
      : [];

    const existingLeagueMap = new Map(
      existingLeagues.map((league) => [league.iracingLeagueId, league.id]),
    );

    const items = eligibleMemberships.map((membership) => ({
      leagueId: membership.league_id,
      leagueName: membership.league?.league_name ?? "Unknown League",
      owner: membership.owner,
      admin: membership.admin,
      alreadyCreated: existingLeagueMap.has(membership.league_id),
    }));

    return NextResponse.json({ items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("Failed to fetch iRacing memberships:", message);
    return NextResponse.json(
      { error: "membership_fetch_failed", message },
      { status: 500 },
    );
  }
}
