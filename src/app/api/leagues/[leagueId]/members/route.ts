import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  try {
    const { leagueId } = await params;
    const accessToken = request.cookies.get("irh_access_token")?.value;

    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const iracingCustId = getIracingCustIdFromJwt(accessToken);

    // Verify user is a member of this league
    const user = await prisma.user.findUnique({
      where: { iracingCustId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const membership = await prisma.leagueMembership.findUnique({
      where: {
        userId_leagueId: {
          userId: user.id,
          leagueId,
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "You do not have access to this league" },
        { status: 403 },
      );
    }

    // Get members for this league
    const members = await prisma.member.findMany({
      where: { leagueId },
      orderBy: [{ owner: "desc" }, { admin: "desc" }, { displayName: "asc" }],
    });

    return NextResponse.json(members);
  } catch (error) {
    console.error("Error fetching league members:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
