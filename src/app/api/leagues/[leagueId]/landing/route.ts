import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";

const PAYOUT_SLOTS = 60;

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

function normalizeTrackName(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const lowered = normalized.toLowerCase();
  if (lowered === "undefined" || lowered === "null") {
    return null;
  }

  return normalized;
}

function normalizePayout(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return Array.from({ length: PAYOUT_SLOTS }, () => 0);
  }

  const normalized = value
    .slice(0, PAYOUT_SLOTS)
    .map((amount) =>
      Number.isFinite(amount) && Number(amount) >= 0
        ? Math.floor(Number(amount))
        : 0,
    );

  while (normalized.length < PAYOUT_SLOTS) {
    normalized.push(0);
  }

  return normalized;
}

function resolveRaceEarnings(
  finishPosition: number | null,
  args: {
    virtualModeEnabled: boolean;
    schedulePayoutSplit: unknown;
  },
): number | null {
  if (!args.virtualModeEnabled) {
    return null;
  }

  const payout = normalizePayout(args.schedulePayoutSplit);
  const basePayout =
    finishPosition != null &&
    finishPosition >= 1 &&
    finishPosition <= PAYOUT_SLOTS
      ? (payout[finishPosition - 1] ?? 0)
      : 0;

  return basePayout;
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
            recruitingOpen: true,
            recruitingSeries: {
              select: {
                series: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
              orderBy: { series: { name: "asc" } },
            },
            virtualModeEnabled: true,
            virtualEntryFee: true,
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
            recruitingOpen: true,
            recruitingSeries: {
              select: {
                series: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
              orderBy: { series: { name: "asc" } },
            },
            virtualModeEnabled: true,
            virtualEntryFee: true,
          },
        });

    if (!league) {
      return NextResponse.json({ error: "league_not_found" }, { status: 404 });
    }

    let authUser: {
      id: string;
      iracingCustId: number;
      displayName: string | null;
      country: string | null;
    } | null = null;
    let membership: {
      owner: boolean;
      admin: boolean;
    } | null = null;

    if (accessToken) {
      try {
        const iracingCustId = getIracingCustIdFromJwt(accessToken);
        authUser = await prisma.user.findUnique({
          where: { iracingCustId },
          select: {
            id: true,
            iracingCustId: true,
            displayName: true,
            country: true,
          },
        });

        if (authUser) {
          membership = await prisma.leagueMembership.findUnique({
            where: {
              userId_leagueId: { userId: authUser.id, leagueId: league.id },
            },
            select: { owner: true, admin: true },
          });
        }
      } catch (authError) {
        console.warn(
          "[league landing route] failed to resolve auth",
          authError,
        );
      }
    }

    const isAdmin = Boolean(membership?.owner || membership?.admin);

    const [currentMember, currentJoinRequest, series] = await Promise.all([
      authUser
        ? prisma.member.findUnique({
            where: {
              leagueId_custId: {
                leagueId: league.id,
                custId: authUser.iracingCustId,
              },
            },
            select: { id: true, displayName: true },
          })
        : Promise.resolve(null),
      authUser
        ? prisma.leagueJoinRequest.findFirst({
            where: {
              leagueId: league.id,
              requesterUserId: authUser.id,
              status: "PENDING",
            },
            select: {
              id: true,
              status: true,
              createdAt: true,
              requestedSeries: {
                select: {
                  series: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          })
        : Promise.resolve(null),
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

        const [nextEventRaw, lastRaceResultRaw, standingsRows] =
          await Promise.all([
            prisma.schedule.findFirst({
              where: {
                seriesId: seriesItem.id,
                seasonId: activeSeason.id,
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
                weather: true,
                roomOpenTime: true,
                greenFlagTime: true,
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
                    trackName: true,
                    virtualPayoutSplit: true,
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
          ]);

        const lastRaceResult = lastRaceResultRaw
          ? {
              ...lastRaceResultRaw,
              trackName:
                normalizeTrackName(lastRaceResultRaw.trackName) ??
                normalizeTrackName(lastRaceResultRaw.schedule?.trackName),
              results: lastRaceResultRaw.results.map((result) => ({
                ...result,
                virtualEarnings: resolveRaceEarnings(result.finishPosition, {
                  virtualModeEnabled: league.virtualModeEnabled,
                  schedulePayoutSplit:
                    lastRaceResultRaw.schedule?.virtualPayoutSplit ?? [],
                }),
              })),
            }
          : null;

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
      league: {
        id: league.id,
        iracingLeagueId: league.iracingLeagueId,
        leagueName: league.leagueName,
        smallLogo: league.smallLogo,
        largeLogo: league.largeLogo,
        rosterCount: league.rosterCount,
        about: league.about,
        message: league.message,
        routeLeagueId: league.iracingLeagueId
          ? String(league.iracingLeagueId)
          : league.id,
        recruiting: {
          open: league.recruitingOpen,
          series: league.recruitingSeries.map((entry) => entry.series),
        },
      },
      isAdmin,
      canSelfRegister: Boolean(membership && currentMember),
      isLeagueMember: Boolean(currentMember),
      viewer: authUser
        ? {
            iracingCustId: authUser.iracingCustId,
            displayName: authUser.displayName,
            country: authUser.country,
          }
        : null,
      currentJoinRequest: currentJoinRequest
        ? {
            id: currentJoinRequest.id,
            status: currentJoinRequest.status,
            createdAt: currentJoinRequest.createdAt,
            requestedSeries: currentJoinRequest.requestedSeries.map(
              (entry) => entry.series,
            ),
          }
        : null,
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
