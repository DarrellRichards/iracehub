import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  try {
    const { leagueId: rawLeagueId } = await params;
    const accessToken = request.cookies.get("irh_access_token")?.value;

    if (!accessToken) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const iracingLeagueIdNum = parseInt(rawLeagueId, 10);
    const league = Number.isNaN(iracingLeagueIdNum)
      ? await prisma.league.findUnique({
          where: { id: rawLeagueId },
          select: {
            id: true,
            iracingLeagueId: true,
            leagueName: true,
            smallLogo: true,
            largeLogo: true,
            rosterCount: true,
            about: true,
            message: true,
          },
        })
      : await prisma.league.findUnique({
          where: { iracingLeagueId: iracingLeagueIdNum },
          select: {
            id: true,
            iracingLeagueId: true,
            leagueName: true,
            smallLogo: true,
            largeLogo: true,
            rosterCount: true,
            about: true,
            message: true,
          },
        });

    if (!league) {
      return NextResponse.json({ error: "league_not_found" }, { status: 404 });
    }

    const iracingCustId = getIracingCustIdFromJwt(accessToken);
    const user = await prisma.user.findUnique({
      where: { iracingCustId },
      select: { id: true, iracingCustId: true },
    });

    if (!user) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    const membership = await prisma.leagueMembership.findUnique({
      where: { userId_leagueId: { userId: user.id, leagueId: league.id } },
      select: { owner: true, admin: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "not_a_member" }, { status: 403 });
    }

    const isAdmin = membership.owner || membership.admin;

    const [currentMember, series] = await Promise.all([
      prisma.member.findUnique({
        where: {
          leagueId_custId: {
            leagueId: league.id,
            custId: user.iracingCustId,
          },
        },
        select: { id: true, displayName: true },
      }),
      prisma.series.findMany({
        where: { leagueId: league.id, isActive: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          seasons: {
            where: { isActive: true, hidden: false },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              seasonName: true,
              description: true,
              iracingSeasonId: true,
            },
          },
        },
      }),
    ]);

    const now = new Date();

    const seriesCards = await Promise.all(
      series.map(async (seriesItem) => {
        const activeSeason = seriesItem.seasons[0] ?? null;

        if (!activeSeason) {
          return {
            id: seriesItem.id,
            name: seriesItem.name,
            description: seriesItem.description,
            season: null,
            nextEvent: null,
            lastRaceResult: null,
            standings: [],
          };
        }

        const [nextEventRaw, lastRaceResult, standingsRows] = await Promise.all(
          [
            prisma.schedule.findFirst({
              where: {
                seriesId: seriesItem.id,
                seasonId: activeSeason.id,
                eventDate: { gte: now },
              },
              orderBy: [{ eventDate: "asc" }, { raceOrder: "asc" }],
              select: {
                id: true,
                eventDate: true,
                raceName: true,
                isOffWeek: true,
                pointsCount: true,
                canDrop: true,
                registrationEnabled: true,
                trackName: true,
                trackId: true,
                raceLength: true,
                raceOrder: true,
                iracingSessionId: true,
                importedSession: {
                  select: {
                    id: true,
                    iracingSessionId: true,
                    subsessionId: true,
                    hasResults: true,
                    trackName: true,
                    winnerName: true,
                    winnerCustId: true,
                    launchAt: true,
                    status: true,
                    _count: { select: { results: true } },
                  },
                },
                registrations: {
                  include: {
                    member: {
                      select: {
                        id: true,
                        custId: true,
                        displayName: true,
                        carNumber: true,
                        nickName: true,
                      },
                    },
                  },
                  orderBy: { createdAt: "asc" },
                },
              },
            }),
            prisma.raceSession.findFirst({
              where: {
                leagueId: league.id,
                seriesId: seriesItem.id,
                seasonId: activeSeason.id,
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
                subsessionId: true,
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
                  take: 10,
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
            }),
            prisma.raceSessionResult.findMany({
              where: {
                raceSession: {
                  leagueId: league.id,
                  seriesId: seriesItem.id,
                  seasonId: activeSeason.id,
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
            }),
          ],
        );

        const nextEvent = nextEventRaw
          ? {
              ...nextEventRaw,
              registrationCount: nextEventRaw.registrations.length,
              isRegisteredByMe: currentMember
                ? nextEventRaw.registrations.some(
                    (registration) =>
                      registration.memberId === currentMember.id,
                  )
                : false,
              registeredMembers: isAdmin
                ? nextEventRaw.registrations.map((registration) => ({
                    id: registration.id,
                    createdAt: registration.createdAt,
                    member: registration.member,
                  }))
                : [],
            }
          : null;

        return {
          id: seriesItem.id,
          name: seriesItem.name,
          description: seriesItem.description,
          season: activeSeason,
          nextEvent,
          lastRaceResult,
          standings: buildStandings(standingsRows).slice(0, 10),
        };
      }),
    );

    return NextResponse.json({
      league,
      isAdmin,
      canSelfRegister: Boolean(currentMember),
      series: seriesCards,
    });
  } catch (error) {
    console.error("[league landing route]", error);
    return NextResponse.json(
      { error: "failed_to_load_landing" },
      { status: 500 },
    );
  }
}
