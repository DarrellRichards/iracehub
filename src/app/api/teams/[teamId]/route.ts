import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";

/**
 * GET /api/teams/[teamId]
 * Get team details including earnings and bank information
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await context.params;
    const accessToken = request.cookies.get("irh_access_token")?.value;

    if (!accessToken) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    let iracingCustId: number;
    try {
      iracingCustId = getIracingCustIdFromJwt(accessToken);
    } catch {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    if (!Number.isInteger(iracingCustId) || iracingCustId <= 0) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const user = await prisma.user.findUnique({
      where: { iracingCustId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        league: {
          select: {
            id: true,
            leagueName: true,
          },
        },
        captain: {
          select: {
            id: true,
            custId: true,
            displayName: true,
          },
        },
        members: {
          include: {
            member: {
              select: {
                id: true,
                custId: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    if (!team) {
      return NextResponse.json({ error: "team_not_found" }, { status: 404 });
    }

    const membership = await prisma.leagueMembership.findUnique({
      where: {
        userId_leagueId: {
          userId: user.id,
          leagueId: team.leagueId,
        },
      },
      select: { id: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      id: team.id,
      name: team.name,
      leagueId: team.leagueId,
      leagueName: team.league.leagueName,
      virtualBank: team.virtualBank,
      totalEarned: team.totalEarned,
      captain: team.captain,
      members: team.members.map((m) => ({
        id: m.id,
        role: m.role,
        joinedAt: m.joinedAt,
        member: m.member,
      })),
    });
  } catch (error) {
    console.error("Error fetching team details:", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}
