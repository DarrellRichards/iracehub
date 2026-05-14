import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";

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

    // leagueId may be either the DB id or the iRacing numeric league ID
    const iracingLeagueIdNum = parseInt(rawLeagueId, 10);
    const league = isNaN(iracingLeagueIdNum)
      ? await prisma.league.findUnique({
          where: { id: rawLeagueId },
          select: { id: true, iracingLeagueId: true },
        })
      : await prisma.league.findUnique({
          where: { iracingLeagueId: iracingLeagueIdNum },
          select: { id: true, iracingLeagueId: true },
        });

    if (!league) {
      return NextResponse.json({ error: "league_not_found" }, { status: 404 });
    }

    const leagueDbId = league.id;

    const iracingCustId = getIracingCustIdFromJwt(accessToken);
    const user = await prisma.user.findUnique({
      where: { iracingCustId },
      select: { id: true, iracingCustId: true },
    });
    if (!user) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    const membership = await prisma.leagueMembership.findUnique({
      where: { userId_leagueId: { userId: user.id, leagueId: leagueDbId } },
      select: { owner: true, admin: true },
    });
    if (!membership) {
      return NextResponse.json({ error: "not_a_member" }, { status: 403 });
    }

    const isAdmin = membership.owner || membership.admin;

    const member = await prisma.member.findUnique({
      where: {
        leagueId_custId: {
          leagueId: leagueDbId,
          custId: user.iracingCustId,
        },
      },
      select: { id: true },
    });

    const series = await prisma.series.findMany({
      where: { leagueId: leagueDbId },
      include: {
        seasons: {
          where: { isActive: true, hidden: false },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            seasonName: true,
            description: true,
            isActive: true,
            numDrops: true,
            iracingSeasonId: true,
            schedules: {
              orderBy: { raceOrder: "asc" },
              include: {
                importedSession: {
                  select: {
                    id: true,
                    iracingSessionId: true,
                    subsessionId: true,
                    hasResults: true,
                    trackName: true,
                    trackId: true,
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
                  orderBy: {
                    createdAt: "asc",
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const hydratedSeries = series.map((seriesItem) => ({
      ...seriesItem,
      seasons: seriesItem.seasons.map((season) => ({
        ...season,
        schedules: season.schedules.map((schedule) => {
          const registrations = schedule.registrations;
          return {
            ...schedule,
            registrationCount: registrations.length,
            isRegisteredByMe: member
              ? registrations.some(
                  (registration) => registration.memberId === member.id,
                )
              : false,
            registeredMembers: isAdmin
              ? registrations.map((registration) => ({
                  id: registration.id,
                  createdAt: registration.createdAt,
                  member: registration.member,
                }))
              : [],
          };
        }),
      })),
    }));

    return NextResponse.json({
      series: hydratedSeries,
      isAdmin,
      leagueDbId,
      iracingLeagueId: league.iracingLeagueId,
    });
  } catch (error) {
    console.error("[calendar route]", error);
    return NextResponse.json(
      { error: "failed_to_load_calendar" },
      { status: 500 },
    );
  }
}
