import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ custId: string }> },
) {
  const { custId: rawCustId } = await params;
  const custId = parseInt(rawCustId, 10);

  if (isNaN(custId) || custId <= 0) {
    return NextResponse.json({ error: "invalid_cust_id" }, { status: 400 });
  }

  const accessToken = request.cookies.get("irh_access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const iracingCustId = getIracingCustIdFromJwt(accessToken);
  const user = await prisma.user.findUnique({
    where: { iracingCustId },
    select: {
      id: true,
      leagueMemberships: {
        select: {
          leagueId: true,
          league: {
            select: {
              id: true,
              iracingLeagueId: true,
              leagueName: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const accessibleLeagueIds = user.leagueMemberships.map((m) => m.leagueId);
  if (accessibleLeagueIds.length === 0) {
    return NextResponse.json({ error: "no_league_access" }, { status: 403 });
  }

  const results = await prisma.raceSessionResult.findMany({
    where: {
      custId,
      raceSession: {
        leagueId: { in: accessibleLeagueIds },
      },
    },
    select: {
      id: true,
      displayName: true,
      finishPosition: true,
      startPosition: true,
      lapsCompleted: true,
      incidents: true,
      pointsBase: true,
      pointsAdjustment: true,
      finalPoints: true,
      provisional: true,
      notes: true,
      raceSession: {
        select: {
          id: true,
          launchAt: true,
          trackName: true,
          league: {
            select: {
              id: true,
              iracingLeagueId: true,
              leagueName: true,
            },
          },
          series: {
            select: {
              id: true,
              name: true,
            },
          },
          season: {
            select: {
              id: true,
              seasonName: true,
            },
          },
          schedule: {
            select: {
              raceName: true,
              eventDate: true,
              raceOrder: true,
            },
          },
        },
      },
    },
    orderBy: {
      raceSession: {
        launchAt: "desc",
      },
    },
  });

  if (results.length === 0) {
    return NextResponse.json({
      driver: {
        custId,
        displayName: `Driver #${custId}`,
      },
      summary: {
        starts: 0,
        wins: 0,
        top5: 0,
        avgFinish: null,
        totalPoints: 0,
      },
      leagues: [],
      results: [],
    });
  }

  const displayName = results[0].displayName;

  let starts = 0;
  let wins = 0;
  let top5 = 0;
  let finishSum = 0;
  let finishCount = 0;
  let totalPoints = 0;

  const byLeague = new Map<
    string,
    {
      leagueId: string;
      iracingLeagueId: number;
      leagueName: string;
      starts: number;
      wins: number;
      top5: number;
      totalPoints: number;
    }
  >();

  for (const row of results) {
    starts += 1;
    totalPoints += row.finalPoints ?? 0;

    if (row.finishPosition != null && row.finishPosition > 0) {
      if (row.finishPosition === 1) wins += 1;
      if (row.finishPosition <= 5) top5 += 1;
      finishSum += row.finishPosition;
      finishCount += 1;
    }

    const leagueKey = row.raceSession.league.id;
    const current = byLeague.get(leagueKey) ?? {
      leagueId: row.raceSession.league.id,
      iracingLeagueId: row.raceSession.league.iracingLeagueId,
      leagueName: row.raceSession.league.leagueName,
      starts: 0,
      wins: 0,
      top5: 0,
      totalPoints: 0,
    };

    current.starts += 1;
    current.totalPoints += row.finalPoints ?? 0;
    if (row.finishPosition != null && row.finishPosition > 0) {
      if (row.finishPosition === 1) current.wins += 1;
      if (row.finishPosition <= 5) current.top5 += 1;
    }

    byLeague.set(leagueKey, current);
  }

  const leagues = Array.from(byLeague.values())
    .map((value) => ({
      ...value,
      totalPoints: round2(value.totalPoints),
    }))
    .sort((a, b) => b.totalPoints - a.totalPoints);

  return NextResponse.json({
    driver: {
      custId,
      displayName,
    },
    summary: {
      starts,
      wins,
      top5,
      avgFinish: finishCount > 0 ? round2(finishSum / finishCount) : null,
      totalPoints: round2(totalPoints),
    },
    leagues,
    results,
  });
}
