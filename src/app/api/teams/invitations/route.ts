import { NextRequest, NextResponse } from "next/server";
import { TeamInviteStatus } from "@prisma/client";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const accessToken = request.cookies.get("irh_access_token")?.value;
    if (!accessToken) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const iracingCustId = getIracingCustIdFromJwt(accessToken);
    const user = await prisma.user.findUnique({
      where: { iracingCustId },
      select: { id: true, iracingCustId: true },
    });

    if (!user) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    // Find all Member records belonging to this user across all leagues
    const members = await prisma.member.findMany({
      where: { custId: user.iracingCustId },
      select: { id: true, leagueId: true },
    });

    if (members.length === 0) {
      return NextResponse.json({ invitations: [] });
    }

    const memberIds = members.map((m) => m.id);

    const invitations = await prisma.teamInvite.findMany({
      where: {
        invitedMemberId: { in: memberIds },
        status: TeamInviteStatus.PENDING,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        team: {
          select: {
            id: true,
            name: true,
            league: {
              select: {
                id: true,
                iracingLeagueId: true,
                leagueName: true,
              },
            },
            captain: {
              select: {
                id: true,
                custId: true,
                displayName: true,
                carNumber: true,
                nickName: true,
              },
            },
          },
        },
        invitedByMember: {
          select: {
            id: true,
            custId: true,
            displayName: true,
          },
        },
      },
    });

    return NextResponse.json({ invitations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("[teams/invitations route]", message);
    return NextResponse.json(
      { error: "failed_to_load_invitations", message },
      { status: 500 },
    );
  }
}
