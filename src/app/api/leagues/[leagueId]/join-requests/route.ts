import { LeagueJoinRequestStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";
import { prisma } from "@/lib/prisma";

async function getAuthenticatedUser(accessToken: string) {
  const iracingCustId = getIracingCustIdFromJwt(accessToken);

  return prisma.user.findUnique({
    where: { iracingCustId },
    select: {
      id: true,
      iracingCustId: true,
      displayName: true,
      country: true,
    },
  });
}

async function requireLeagueAdmin(leagueId: string, accessToken: string) {
  const user = await getAuthenticatedUser(accessToken);

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

  return { user };
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

    const [league, requests] = await Promise.all([
      prisma.league.findUnique({
        where: { id: leagueId },
        select: {
          id: true,
          leagueName: true,
          iracingLeagueId: true,
          url: true,
        },
      }),
      prisma.leagueJoinRequest.findMany({
        where: { leagueId },
        include: {
          requestedSeries: {
            include: {
              series: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          reviewedBy: {
            select: {
              id: true,
              displayName: true,
              iracingCustId: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    if (!league) {
      return NextResponse.json({ error: "league_not_found" }, { status: 404 });
    }

    const requestsWithMembership = await Promise.all(
      requests.map(async (requestRow) => {
        const member = await prisma.member.findUnique({
          where: {
            leagueId_custId: {
              leagueId,
              custId: requestRow.requesterCustId,
            },
          },
          select: { id: true },
        });

        return {
          id: requestRow.id,
          requesterCustId: requestRow.requesterCustId,
          fullName: requestRow.fullName,
          state: requestRow.state,
          country: requestRow.country,
          whyJoin: requestRow.whyJoin,
          status: requestRow.status,
          createdAt: requestRow.createdAt,
          updatedAt: requestRow.updatedAt,
          reviewedAt: requestRow.reviewedAt,
          reviewedBy: requestRow.reviewedBy,
          requestedSeries: requestRow.requestedSeries.map(
            (entry) => entry.series,
          ),
          isLeagueMember: Boolean(member),
        };
      }),
    );

    const statusWeight: Record<LeagueJoinRequestStatus, number> = {
      PENDING: 0,
      APPROVED: 1,
      DECLINED: 2,
    };

    requestsWithMembership.sort((a, b) => {
      const weightDiff = statusWeight[a.status] - statusWeight[b.status];
      if (weightDiff !== 0) {
        return weightDiff;
      }

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return NextResponse.json({
      league,
      requests: requestsWithMembership,
    });
  } catch (error) {
    console.error("[join-requests.get]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}

interface CreateJoinRequestBody {
  iracingId?: number;
  fullName?: string;
  state?: string;
  country?: string;
  whyJoin?: string;
  seriesIds?: string[];
}

const trimToNull = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;
  const accessToken = request.cookies.get("irh_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: CreateJoinRequestBody;
  try {
    body = (await request.json()) as CreateJoinRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json_body" }, { status: 400 });
  }

  const fullName = trimToNull(body.fullName);
  const state = trimToNull(body.state);
  const country = trimToNull(body.country);
  const whyJoin = trimToNull(body.whyJoin);
  const selectedSeriesIds =
    body.seriesIds?.filter(
      (seriesId): seriesId is string =>
        typeof seriesId === "string" && seriesId.trim().length > 0,
    ) ?? [];
  const uniqueSeriesIds = Array.from(new Set(selectedSeriesIds));

  if (!fullName || !state || !country || !whyJoin) {
    return NextResponse.json(
      { error: "missing_required_fields" },
      { status: 400 },
    );
  }

  if (uniqueSeriesIds.length === 0) {
    return NextResponse.json(
      { error: "series_selection_required" },
      { status: 400 },
    );
  }

  try {
    const user = await getAuthenticatedUser(accessToken);

    if (!user) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    const [league, existingMember, pendingRequest] = await Promise.all([
      prisma.league.findUnique({
        where: { id: leagueId },
        select: {
          id: true,
          recruitingOpen: true,
          recruitingSeries: {
            select: {
              seriesId: true,
            },
          },
        },
      }),
      prisma.member.findUnique({
        where: {
          leagueId_custId: {
            leagueId,
            custId: user.iracingCustId,
          },
        },
        select: { id: true },
      }),
      prisma.leagueJoinRequest.findFirst({
        where: {
          leagueId,
          requesterUserId: user.id,
          status: LeagueJoinRequestStatus.PENDING,
        },
        select: { id: true },
      }),
    ]);

    if (!league) {
      return NextResponse.json({ error: "league_not_found" }, { status: 404 });
    }

    if (!league.recruitingOpen) {
      return NextResponse.json({ error: "recruiting_closed" }, { status: 403 });
    }

    if (existingMember) {
      return NextResponse.json({ error: "already_member" }, { status: 409 });
    }

    if (pendingRequest) {
      return NextResponse.json(
        { error: "pending_request_exists" },
        { status: 409 },
      );
    }

    const openSeriesIdSet = new Set(
      league.recruitingSeries.map((entry) => entry.seriesId),
    );

    if (openSeriesIdSet.size === 0) {
      return NextResponse.json(
        { error: "no_series_open_for_recruiting" },
        { status: 400 },
      );
    }

    const hasInvalidSeries = uniqueSeriesIds.some(
      (seriesId) => !openSeriesIdSet.has(seriesId),
    );

    if (hasInvalidSeries) {
      return NextResponse.json(
        { error: "invalid_series_selection" },
        { status: 400 },
      );
    }

    const created = await prisma.leagueJoinRequest.create({
      data: {
        leagueId,
        requesterUserId: user.id,
        requesterCustId: user.iracingCustId,
        fullName,
        state,
        country,
        whyJoin,
        requestedSeries: {
          createMany: {
            data: uniqueSeriesIds.map((seriesId) => ({ seriesId })),
          },
        },
      },
      include: {
        requestedSeries: {
          include: {
            series: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(
      {
        id: created.id,
        status: created.status,
        requesterCustId: created.requesterCustId,
        fullName: created.fullName,
        state: created.state,
        country: created.country,
        whyJoin: created.whyJoin,
        requestedSeries: created.requestedSeries.map((entry) => entry.series),
        createdAt: created.createdAt,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[join-requests.post]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}
