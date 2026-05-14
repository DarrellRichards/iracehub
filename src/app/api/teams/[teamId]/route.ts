import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
