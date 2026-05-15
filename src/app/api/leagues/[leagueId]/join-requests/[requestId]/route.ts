import { LeagueJoinRequestStatus } from "@prisma/client";
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

interface UpdateJoinRequestBody {
  action?: "approve" | "decline";
}

function buildIracingLeagueAdminUrl(league: {
  url: string | null;
  iracingLeagueId: number | null;
}) {
  if (league.url && league.url.trim().length > 0) {
    return league.url;
  }

  if (league.iracingLeagueId != null) {
    return `https://members-ng.iracing.com/leagues/${league.iracingLeagueId}`;
  }

  return null;
}

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ leagueId: string; requestId: string }>;
  },
) {
  const { leagueId, requestId } = await params;
  const accessToken = request.cookies.get("irh_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: UpdateJoinRequestBody;
  try {
    body = (await request.json()) as UpdateJoinRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json_body" }, { status: 400 });
  }

  if (body.action !== "approve" && body.action !== "decline") {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  try {
    const auth = await requireLeagueAdmin(leagueId, accessToken);
    if ("error" in auth) {
      return auth.error;
    }

    const joinRequest = await prisma.leagueJoinRequest.findFirst({
      where: {
        id: requestId,
        leagueId,
      },
      select: {
        id: true,
        status: true,
        requesterCustId: true,
        fullName: true,
      },
    });

    if (!joinRequest) {
      return NextResponse.json(
        { error: "join_request_not_found" },
        { status: 404 },
      );
    }

    if (joinRequest.status !== LeagueJoinRequestStatus.PENDING) {
      return NextResponse.json(
        { error: "join_request_already_reviewed" },
        { status: 409 },
      );
    }

    const nextStatus =
      body.action === "approve"
        ? LeagueJoinRequestStatus.APPROVED
        : LeagueJoinRequestStatus.DECLINED;

    const [updatedRequest, existingMember, league] = await prisma.$transaction([
      prisma.leagueJoinRequest.update({
        where: { id: joinRequest.id },
        data: {
          status: nextStatus,
          reviewedByUserId: auth.userId,
          reviewedAt: new Date(),
        },
        select: {
          id: true,
          status: true,
          reviewedAt: true,
          requesterCustId: true,
          fullName: true,
        },
      }),
      prisma.member.findUnique({
        where: {
          leagueId_custId: {
            leagueId,
            custId: joinRequest.requesterCustId,
          },
        },
        select: { id: true },
      }),
      prisma.league.findUnique({
        where: { id: leagueId },
        select: {
          id: true,
          iracingLeagueId: true,
          url: true,
        },
      }),
    ]);

    if (!league) {
      return NextResponse.json({ error: "league_not_found" }, { status: 404 });
    }

    const needsManualIracingAdd =
      body.action === "approve" && existingMember == null;

    return NextResponse.json({
      request: updatedRequest,
      needsManualIracingAdd,
      iracingLeagueAdminUrl: needsManualIracingAdd
        ? buildIracingLeagueAdminUrl(league)
        : null,
    });
  } catch (error) {
    console.error("[join-requests.patch]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}
