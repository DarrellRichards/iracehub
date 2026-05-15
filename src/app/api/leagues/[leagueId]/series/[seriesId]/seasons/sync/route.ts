import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";
import { prisma } from "@/lib/prisma";
import { fetchIracingLinkedJson, IracingApiError } from "@/lib/iracing/api";

interface IracingSeasonSession {
  session_id: number;
  subsession_id: number;
  private_session_id: number;
  launch_at: string;
  league_id: number;
  league_season_id: number;
  race_laps: number;
  race_length: number;
  time_limit: number;
  status: number;
  has_results: boolean;
  winner_id: number;
  winner_name: string;
  track?: {
    track_id?: number;
    track_name?: string;
  };
  track_state?: Record<string, unknown>;
  weather?: Record<string, unknown>;
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  if (value == null) {
    return {};
  }

  return value as Prisma.InputJsonValue;
}

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      leagueId: string;
      seriesId: string;
    }>;
  },
) {
  const { leagueId, seriesId } = await params;
  const accessToken = request.cookies.get("irh_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const iracingCustId = getIracingCustIdFromJwt(accessToken);
    const body = (await request.json().catch(() => ({}))) as {
      seasonIds?: number[];
      sessionIdsBySeason?: Record<string, number[]>;
    };
    const selectedSeasonIds =
      body.seasonIds?.filter((id): id is number => Number.isInteger(id)) ?? [];
    const selectedSessionIdsBySeason = Object.fromEntries(
      Object.entries(body.sessionIdsBySeason ?? {}).map(([key, values]) => [
        key,
        Array.isArray(values)
          ? values.filter((v): v is number => Number.isInteger(v))
          : [],
      ]),
    ) as Record<string, number[]>;

    // Verify user is admin/owner
    const user = await prisma.user.findUnique({
      where: { iracingCustId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    const membership = await prisma.leagueMembership.findUnique({
      where: {
        userId_leagueId: {
          userId: user.id,
          leagueId,
        },
      },
      select: { owner: true, admin: true },
    });

    if (!membership || (!membership.owner && !membership.admin)) {
      return NextResponse.json(
        { error: "forbidden_not_owner_or_admin" },
        { status: 403 },
      );
    }

    // Get the series to find the league's iRacing ID
    const series = await prisma.series.findUnique({
      where: { id: seriesId },
      select: {
        leagueId: true,
        league: { select: { iracingLeagueId: true } },
        pointsSystem: {
          select: {
            positionPoints: true,
            bonusPoints: true,
          },
        },
      },
    });

    if (!series || series.leagueId !== leagueId) {
      return NextResponse.json({ error: "series_not_found" }, { status: 404 });
    }

    if (!Number.isInteger(series.league.iracingLeagueId)) {
      return NextResponse.json(
        {
          error:
            "League is not linked to an iRacing league yet. Link it first, then sync seasons.",
        },
        { status: 400 },
      );
    }

    const leagueSeasonsData = await fetchIracingLinkedJson<{
      seasons?: Array<{
        league_id: number;
        season_id: number;
        points_system_id: number;
        season_name: string;
        active: boolean;
        hidden: boolean;
        num_drops: number;
        no_drops_on_or_after_race_num: number;
        points_cars: Array<{ car_id: number; car_name: string }>;
        points_system_name: string;
        points_system_desc: string;
      }>;
    }>(
      accessToken,
      `/data/league/seasons?league_id=${series.league.iracingLeagueId}`,
    );

    const iracingSeasons = leagueSeasonsData.seasons ?? [];

    const parsedSeasons = iracingSeasons as Array<{
      league_id: number;
      season_id: number;
      points_system_id: number;
      season_name: string;
      active: boolean;
      hidden: boolean;
      num_drops: number;
      no_drops_on_or_after_race_num: number;
      points_cars: Array<{ car_id: number; car_name: string }>;
      points_system_name: string;
      points_system_desc: string;
    }>;

    const seasonsToSync =
      selectedSeasonIds.length > 0
        ? parsedSeasons.filter((season) =>
            selectedSeasonIds.includes(season.season_id),
          )
        : parsedSeasons;

    const syncedSeasons = [];
    let importedSessionsCount = 0;

    // Create seasons that don't already exist
    for (const iSeason of seasonsToSync) {
      const syncedSeason = await prisma.season.upsert({
        where: {
          seriesId_iracingSeasonId: {
            seriesId,
            iracingSeasonId: iSeason.season_id,
          },
        },
        create: {
          seriesId,
          iracingSeasonId: iSeason.season_id,
          seasonName: iSeason.season_name,
          cars: iSeason.points_cars,
          isActive: iSeason.active,
          hidden: iSeason.hidden,
          numDrops: iSeason.num_drops,
          noDropsOnOrAfterRaceNum: iSeason.no_drops_on_or_after_race_num,
          iracingPointsSystemId: iSeason.points_system_id,
          iracingPointsSystemName: iSeason.points_system_name,
          iracingPointsSystemDesc: iSeason.points_system_desc,
          isSynced: true,
          lastSyncedAt: new Date(),
        },
        update: {
          seasonName: iSeason.season_name,
          cars: iSeason.points_cars,
          isActive: iSeason.active,
          hidden: iSeason.hidden,
          numDrops: iSeason.num_drops,
          noDropsOnOrAfterRaceNum: iSeason.no_drops_on_or_after_race_num,
          iracingPointsSystemId: iSeason.points_system_id,
          iracingPointsSystemName: iSeason.points_system_name,
          iracingPointsSystemDesc: iSeason.points_system_desc,
          isSynced: true,
          lastSyncedAt: new Date(),
        },
      });
      syncedSeasons.push(syncedSeason);

      const selectedSessionIds =
        selectedSessionIdsBySeason[String(iSeason.season_id)] ?? [];

      if (selectedSessionIds.length > 0) {
        const sessionsData = await fetchIracingLinkedJson<
          IracingSeasonSession[]
        >(
          accessToken,
          `/data/league/season_sessions?season_id=${iSeason.season_id}&league_id=${series.league.iracingLeagueId}`,
        );

        const sessions = Array.isArray(sessionsData) ? sessionsData : [];
        const sessionsToImport = sessions.filter((session) =>
          selectedSessionIds.includes(session.session_id),
        );

        for (const session of sessionsToImport) {
          const launchAt = new Date(session.launch_at);
          const raceOrder =
            (await prisma.schedule.count({
              where: { seasonId: syncedSeason.id },
            })) + 1;

          const schedule = await prisma.schedule.upsert({
            where: {
              iracingSessionId: session.session_id,
            },
            create: {
              seasonId: syncedSeason.id,
              seriesId,
              eventDate: launchAt,
              raceName:
                session.track?.track_name ?? `Session ${session.session_id}`,
              isOffWeek: false,
              pointsCount: true,
              canDrop: true,
              trackName: session.track?.track_name,
              trackId: session.track?.track_id,
              raceLength:
                session.race_laps > 0
                  ? `${session.race_laps} laps`
                  : session.race_length > 0
                    ? `${session.race_length} min`
                    : session.time_limit > 0
                      ? `${session.time_limit} min limit`
                      : undefined,
              weather: toInputJsonValue(session.weather),
              raceOrder,
              iracingSessionId: session.session_id,
            },
            update: {
              seasonId: syncedSeason.id,
              seriesId,
              eventDate: launchAt,
              raceName:
                session.track?.track_name ?? `Session ${session.session_id}`,
              trackName: session.track?.track_name,
              trackId: session.track?.track_id,
              raceLength:
                session.race_laps > 0
                  ? `${session.race_laps} laps`
                  : session.race_length > 0
                    ? `${session.race_length} min`
                    : session.time_limit > 0
                      ? `${session.time_limit} min limit`
                      : undefined,
              weather: toInputJsonValue(session.weather),
            },
          });

          const raceSession = await prisma.raceSession.upsert({
            where: {
              iracingSessionId: session.session_id,
            },
            create: {
              leagueId,
              seriesId,
              seasonId: syncedSeason.id,
              scheduleId: schedule.id,
              iracingSessionId: session.session_id,
              subsessionId: session.subsession_id,
              privateSessionId: session.private_session_id,
              leagueSeasonId: session.league_season_id,
              launchAt,
              hasResults: session.has_results,
              status: session.status,
              trackId: session.track?.track_id,
              trackName: session.track?.track_name,
              raceLaps: session.race_laps,
              raceLength: session.race_length,
              timeLimit: session.time_limit,
              winnerCustId: session.winner_id,
              winnerName: session.winner_name,
              rawSession: toInputJsonValue(session),
              rawTrackState: toInputJsonValue(session.track_state),
              rawWeather: toInputJsonValue(session.weather),
            },
            update: {
              leagueId,
              seriesId,
              seasonId: syncedSeason.id,
              scheduleId: schedule.id,
              subsessionId: session.subsession_id,
              privateSessionId: session.private_session_id,
              leagueSeasonId: session.league_season_id,
              launchAt,
              hasResults: session.has_results,
              status: session.status,
              trackId: session.track?.track_id,
              trackName: session.track?.track_name,
              raceLaps: session.race_laps,
              raceLength: session.race_length,
              timeLimit: session.time_limit,
              winnerCustId: session.winner_id,
              winnerName: session.winner_name,
              rawSession: toInputJsonValue(session),
              rawTrackState: toInputJsonValue(session.track_state),
              rawWeather: toInputJsonValue(session.weather),
            },
          });

          await prisma.raceSessionPoints.upsert({
            where: { raceSessionId: raceSession.id },
            create: {
              raceSessionId: raceSession.id,
              positionPoints: toInputJsonValue(
                series.pointsSystem.positionPoints,
              ),
              bonusPoints: toInputJsonValue(series.pointsSystem.bonusPoints),
              allowProvisionals: true,
            },
            update: {
              positionPoints: toInputJsonValue(
                series.pointsSystem.positionPoints,
              ),
              bonusPoints: toInputJsonValue(series.pointsSystem.bonusPoints),
            },
          });

          importedSessionsCount += 1;
        }
      }
    }

    console.log("[seasons sync] synced", syncedSeasons.length, "seasons");
    return NextResponse.json({
      success: true,
      syncedCount: syncedSeasons.length,
      requestedCount:
        selectedSeasonIds.length > 0
          ? selectedSeasonIds.length
          : parsedSeasons.length,
      seasons: syncedSeasons,
      importedSessionsCount,
    });
  } catch (error) {
    if (error instanceof IracingApiError) {
      return NextResponse.json(
        { error: "failed_to_fetch_seasons_from_iracing" },
        { status: error.status },
      );
    }

    console.error("[seasons sync]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}
