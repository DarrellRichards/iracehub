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
  const { leagueId: rawLeagueId } = await params;

  const accessToken = request.cookies.get("irh_access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const iracingLeagueIdNum = parseInt(rawLeagueId, 10);
  const league = isNaN(iracingLeagueIdNum)
    ? await prisma.league.findUnique({
        where: { id: rawLeagueId },
        select: { id: true, iracingLeagueId: true, leagueName: true },
      })
    : await prisma.league.findUnique({
        where: { iracingLeagueId: iracingLeagueIdNum },
        select: { id: true, iracingLeagueId: true, leagueName: true },
      });

  if (!league) {
    return NextResponse.json({ error: "league_not_found" }, { status: 404 });
  }

  const iracingCustId = getIracingCustIdFromJwt(accessToken);
  const user = await prisma.user.findUnique({
    where: { iracingCustId },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const membership = await prisma.leagueMembership.findUnique({
    where: { userId_leagueId: { userId: user.id, leagueId: league.id } },
    select: { id: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }

  const results = await prisma.raceSessionResult.findMany({
    where: {
      raceSession: {
        leagueId: league.id,
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
      raceSession: {
        select: {
          series: { select: { id: true, name: true } },
          season: { select: { id: true, seasonName: true } },
        },
      },
    },
  });

  const overallRows = results.map((r) => ({
    custId: r.custId,
    displayName: r.displayName,
    finalPoints: r.finalPoints,
    finishPosition: r.finishPosition,
  }));

  const overall = buildStandings(overallRows);

  const bucket = new Map<
    string,
    {
      seriesId: string;
      seriesName: string;
      seasonId: string;
      seasonName: string;
      rows: Array<{
        custId: number;
        displayName: string;
        finalPoints: number;
        finishPosition: number | null;
      }>;
    }
  >();

  for (const r of results) {
    const key = `${r.raceSession.series.id}:${r.raceSession.season.id}`;
    const current = bucket.get(key) ?? {
      seriesId: r.raceSession.series.id,
      seriesName: r.raceSession.series.name,
      seasonId: r.raceSession.season.id,
      seasonName: r.raceSession.season.seasonName,
      rows: [],
    };

    current.rows.push({
      custId: r.custId,
      displayName: r.displayName,
      finalPoints: r.finalPoints,
      finishPosition: r.finishPosition,
    });

    bucket.set(key, current);
  }

  const bySeriesSeason = Array.from(bucket.values())
    .map((entry) => ({
      seriesId: entry.seriesId,
      seriesName: entry.seriesName,
      seasonId: entry.seasonId,
      seasonName: entry.seasonName,
      standings: buildStandings(entry.rows),
    }))
    .sort((a, b) => {
      const seriesCmp = a.seriesName.localeCompare(b.seriesName);
      if (seriesCmp !== 0) return seriesCmp;
      return a.seasonName.localeCompare(b.seasonName);
    });

  return NextResponse.json({
    league: {
      id: league.id,
      iracingLeagueId: league.iracingLeagueId,
      leagueName: league.leagueName,
    },
    overall,
    bySeriesSeason,
  });
}
