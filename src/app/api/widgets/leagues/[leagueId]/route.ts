import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface StandingEntry {
  custId: number;
  displayName: string;
  points: number;
  starts: number;
  wins: number;
  top5: number;
  avgFinish: number | null;
  gapToLeader: number;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function buildStandings(
  rows: Array<{
    custId: number;
    displayName: string;
    finalPoints: number;
    finishPosition: number | null;
  }>,
): StandingEntry[] {
  const byDriver = new Map<
    number,
    {
      displayName: string;
      points: number;
      starts: number;
      wins: number;
      top5: number;
      finishSum: number;
      finishCount: number;
    }
  >();

  for (const row of rows) {
    const current = byDriver.get(row.custId) ?? {
      displayName: row.displayName,
      points: 0,
      starts: 0,
      wins: 0,
      top5: 0,
      finishSum: 0,
      finishCount: 0,
    };

    current.displayName = row.displayName || current.displayName;
    current.points += row.finalPoints ?? 0;
    current.starts += 1;

    if (row.finishPosition != null && row.finishPosition > 0) {
      if (row.finishPosition === 1) current.wins += 1;
      if (row.finishPosition <= 5) current.top5 += 1;
      current.finishSum += row.finishPosition;
      current.finishCount += 1;
    }

    byDriver.set(row.custId, current);
  }

  const standings = Array.from(byDriver.entries())
    .map(([custId, value]) => ({
      custId,
      displayName: value.displayName,
      points: round2(value.points),
      starts: value.starts,
      wins: value.wins,
      top5: value.top5,
      avgFinish:
        value.finishCount > 0
          ? round2(value.finishSum / value.finishCount)
          : null,
      gapToLeader: 0,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.top5 !== a.top5) return b.top5 - a.top5;
      return a.displayName.localeCompare(b.displayName);
    });

  const leaderPoints = standings[0]?.points ?? 0;
  return standings.map((entry) => ({
    ...entry,
    gapToLeader: round2(leaderPoints - entry.points),
  }));
}

function jsonWithCors(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      ...CORS_HEADERS,
      "Cache-Control":
        "public, max-age=60, s-maxage=60, stale-while-revalidate=120",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId: rawLeagueId } = await params;
  const standingsLimit = Math.min(
    Math.max(
      parseInt(
        request.nextUrl.searchParams.get("standingsLimit") ?? "10",
        10,
      ) || 10,
      1,
    ),
    50,
  );
  const scheduleLimit = Math.min(
    Math.max(
      parseInt(request.nextUrl.searchParams.get("scheduleLimit") ?? "12", 10) ||
        12,
      1,
    ),
    50,
  );
  const resultsLimit = Math.min(
    Math.max(
      parseInt(request.nextUrl.searchParams.get("resultsLimit") ?? "20", 10) ||
        20,
      1,
    ),
    100,
  );

  const iracingLeagueIdNum = parseInt(rawLeagueId, 10);
  const league = isNaN(iracingLeagueIdNum)
    ? await prisma.league.findUnique({
        where: { id: rawLeagueId },
        select: {
          id: true,
          iracingLeagueId: true,
          leagueName: true,
          privateSchedule: true,
          privateResults: true,
          updatedAt: true,
        },
      })
    : await prisma.league.findUnique({
        where: { iracingLeagueId: iracingLeagueIdNum },
        select: {
          id: true,
          iracingLeagueId: true,
          leagueName: true,
          privateSchedule: true,
          privateResults: true,
          updatedAt: true,
        },
      });

  if (!league) {
    return jsonWithCors({ error: "league_not_found" }, 404);
  }

  const now = new Date();
  const canReadSchedule = !league.privateSchedule;
  const canReadResults = !league.privateResults;

  const [
    upcomingSchedule,
    latestSession,
    standingsRows,
    latestStandingsUpdate,
  ] = await Promise.all([
    canReadSchedule
      ? prisma.schedule.findMany({
          where: {
            series: { leagueId: league.id },
            season: { isActive: true, hidden: false },
            eventDate: { gte: now },
            OR: [
              {
                importedSession: {
                  is: null,
                },
              },
              {
                importedSession: {
                  is: {
                    hasResults: false,
                  },
                },
              },
            ],
          },
          orderBy: [{ eventDate: "asc" }, { raceOrder: "asc" }],
          take: scheduleLimit,
          select: {
            id: true,
            eventDate: true,
            raceName: true,
            trackName: true,
            raceLength: true,
            isOffWeek: true,
            pointsCount: true,
            raceOrder: true,
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
          },
        })
      : Promise.resolve([]),
    canReadResults
      ? prisma.raceSession.findFirst({
          where: {
            leagueId: league.id,
            hasResults: true,
          },
          orderBy: { launchAt: "desc" },
          select: {
            id: true,
            launchAt: true,
            trackName: true,
            winnerName: true,
            winnerCustId: true,
            iracingSessionId: true,
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
                id: true,
                raceName: true,
                eventDate: true,
                raceOrder: true,
              },
            },
            results: {
              orderBy: [{ finishPosition: "asc" }, { displayName: "asc" }],
              take: resultsLimit,
              select: {
                id: true,
                custId: true,
                displayName: true,
                finishPosition: true,
                startPosition: true,
                lapsCompleted: true,
                incidents: true,
                finalPoints: true,
                provisional: true,
              },
            },
          },
        })
      : Promise.resolve(null),
    canReadResults
      ? prisma.raceSessionResult.findMany({
          where: {
            raceSession: {
              leagueId: league.id,
              hasResults: true,
              schedule: {
                pointsCount: true,
              },
            },
          },
          select: {
            custId: true,
            displayName: true,
            finalPoints: true,
            finishPosition: true,
          },
        })
      : Promise.resolve([]),
    canReadResults
      ? prisma.raceSessionResult.findFirst({
          where: {
            raceSession: {
              leagueId: league.id,
              hasResults: true,
              schedule: {
                pointsCount: true,
              },
            },
          },
          orderBy: {
            updatedAt: "desc",
          },
          select: {
            updatedAt: true,
          },
        })
      : Promise.resolve(null),
  ]);

  const standings = canReadResults
    ? buildStandings(standingsRows).slice(0, standingsLimit)
    : [];

  return jsonWithCors({
    league: {
      id: league.id,
      iracingLeagueId: league.iracingLeagueId,
      leagueName: league.leagueName,
      updatedAt: league.updatedAt,
    },
    permissions: {
      scheduleVisible: canReadSchedule,
      resultsVisible: canReadResults,
      standingsVisible: canReadResults,
    },
    upcomingEvent: canReadSchedule ? (upcomingSchedule[0] ?? null) : null,
    latestRaceResults: canReadResults ? latestSession : null,
    standingsUpdate: canReadResults
      ? {
          updatedAt: latestStandingsUpdate?.updatedAt ?? null,
          standings,
        }
      : null,
    schedule: canReadSchedule ? upcomingSchedule : [],
    generatedAt: new Date().toISOString(),
  });
}
