import { NextRequest, NextResponse } from "next/server";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";
import { prisma } from "@/lib/prisma";

async function requireLeagueAdmin(leagueId: string, accessToken: string) {
  const iracingCustId = getIracingCustIdFromJwt(accessToken);

  const user = await prisma.user.findUnique({
    where: { iracingCustId },
    select: { id: true },
  });

  if (!user) {
    return {
      error: NextResponse.json({ error: "user_not_found" }, { status: 404 }),
    };
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
    return {
      error: NextResponse.json(
        { error: "forbidden_not_owner_or_admin" },
        { status: 403 },
      ),
    };
  }

  return { userId: user.id };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;
  const accessToken = request.cookies.get("irh_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const auth = await requireLeagueAdmin(leagueId, accessToken);
    if ("error" in auth) {
      return auth.error;
    }

    const [league, allSeries] = await Promise.all([
      prisma.league.findUnique({
        where: { id: leagueId },
        select: {
          id: true,
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
        },
      }),
      prisma.series.findMany({
        where: { leagueId, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    if (!league) {
      return NextResponse.json({ error: "league_not_found" }, { status: 404 });
    }

    return NextResponse.json({
      id: league.id,
      recruitingOpen: league.recruitingOpen,
      openSeries: league.recruitingSeries.map((entry) => entry.series),
      availableSeries: allSeries,
    });
  } catch (error) {
    console.error("[recruiting.get]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}

interface UpdateRecruitingBody {
  recruitingOpen?: boolean;
  openSeriesIds?: string[];
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;
  const accessToken = request.cookies.get("irh_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: UpdateRecruitingBody;
  try {
    body = (await request.json()) as UpdateRecruitingBody;
  } catch {
    return NextResponse.json({ error: "invalid_json_body" }, { status: 400 });
  }

  if (typeof body.recruitingOpen !== "boolean") {
    return NextResponse.json(
      { error: "invalid_recruiting_open" },
      { status: 400 },
    );
  }

  const selectedSeriesIds =
    body.openSeriesIds?.filter(
      (seriesId): seriesId is string =>
        typeof seriesId === "string" && seriesId.trim().length > 0,
    ) ?? [];

  const uniqueSeriesIds = Array.from(new Set(selectedSeriesIds));

  try {
    const auth = await requireLeagueAdmin(leagueId, accessToken);
    if ("error" in auth) {
      return auth.error;
    }

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true },
    });

    if (!league) {
      return NextResponse.json({ error: "league_not_found" }, { status: 404 });
    }

    if (uniqueSeriesIds.length > 0) {
      const matchingSeries = await prisma.series.count({
        where: {
          leagueId,
          isActive: true,
          id: { in: uniqueSeriesIds },
        },
      });

      if (matchingSeries !== uniqueSeriesIds.length) {
        return NextResponse.json(
          { error: "invalid_open_series_ids" },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.league.update({
        where: { id: leagueId },
        data: {
          recruitingOpen: body.recruitingOpen,
        },
      });

      await tx.leagueRecruitingSeries.deleteMany({
        where: { leagueId },
      });

      if (uniqueSeriesIds.length > 0) {
        await tx.leagueRecruitingSeries.createMany({
          data: uniqueSeriesIds.map((seriesId) => ({ leagueId, seriesId })),
        });
      }

      return tx.league.findUnique({
        where: { id: leagueId },
        select: {
          id: true,
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
        },
      });
    });

    if (!updated) {
      return NextResponse.json({ error: "league_not_found" }, { status: 404 });
    }

    return NextResponse.json({
      id: updated.id,
      recruitingOpen: updated.recruitingOpen,
      openSeries: updated.recruitingSeries.map((entry) => entry.series),
    });
  } catch (error) {
    console.error("[recruiting.patch]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}
