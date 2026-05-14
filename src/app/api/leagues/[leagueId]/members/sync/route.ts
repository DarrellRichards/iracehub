import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";
import { fetchIracingLinkedJson, IracingApiError } from "@/lib/iracing/api";

interface Helmet {
  pattern: number;
  color1: string;
  color2: string;
  color3: string;
  face_type: number;
  helmet_type: number;
}

interface IracingMember {
  cust_id: number;
  display_name: string;
  helmet: Helmet;
  owner: boolean;
  admin: boolean;
  league_mail_opt_out: boolean;
  league_pm_opt_out: boolean;
  league_member_since: string;
  car_number: string | null;
  nick_name: string | null;
}

export async function POST(
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

    // Verify user is admin or owner of this league
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
      select: { owner: true, admin: true },
    });

    if (!membership || (!membership.admin && !membership.owner)) {
      return NextResponse.json(
        { error: "You do not have permission to sync members" },
        { status: 403 },
      );
    }

    // Get the league's iRacing ID
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { iracingLeagueId: true },
    });

    if (!league) {
      return NextResponse.json({ error: "League not found" }, { status: 404 });
    }

    // Fetch members from iRacing API
    const leagueData = await fetchIracingLinkedJson<{
      roster?: IracingMember[];
    }>(accessToken, `/data/league/get?league_id=${league.iracingLeagueId}`);

    const iracingMembers: IracingMember[] = leagueData.roster || [];

    // Upsert members into database
    let syncedCount = 0;
    const syncResults = await Promise.all(
      iracingMembers.map(async (member) => {
        try {
          await prisma.member.upsert({
            where: {
              leagueId_custId: {
                leagueId,
                custId: member.cust_id,
              },
            },
            create: {
              leagueId,
              custId: member.cust_id,
              displayName: member.display_name,
              owner: member.owner,
              admin: member.admin,
              leagueMailOptOut: member.league_mail_opt_out,
              leaguePmOptOut: member.league_pm_opt_out,
              leagueMemberSince: new Date(member.league_member_since),
              carNumber: member.car_number,
              nickName: member.nick_name,
              helmet: {
                pattern: member.helmet.pattern,
                color1: member.helmet.color1,
                color2: member.helmet.color2,
                color3: member.helmet.color3,
                face_type: member.helmet.face_type,
                helmet_type: member.helmet.helmet_type,
              },
              lastSyncedAt: new Date(),
            },
            update: {
              displayName: member.display_name,
              owner: member.owner,
              admin: member.admin,
              leagueMailOptOut: member.league_mail_opt_out,
              leaguePmOptOut: member.league_pm_opt_out,
              leagueMemberSince: new Date(member.league_member_since),
              carNumber: member.car_number,
              nickName: member.nick_name,
              helmet: {
                pattern: member.helmet.pattern,
                color1: member.helmet.color1,
                color2: member.helmet.color2,
                color3: member.helmet.color3,
                face_type: member.helmet.face_type,
                helmet_type: member.helmet.helmet_type,
              },
              lastSyncedAt: new Date(),
            },
          });
          syncedCount++;
          return { success: true };
        } catch (err) {
          console.error(`Failed to sync member ${member.cust_id}:`, err);
          return { success: false, error: err };
        }
      }),
    );

    // Remove members that are no longer on the roster
    const iracingCustIds = iracingMembers.map((m) => m.cust_id);
    let removedCount = 0;
    try {
      const result = await prisma.member.deleteMany({
        where: {
          leagueId,
          custId: {
            notIn: iracingCustIds,
          },
        },
      });
      removedCount = result.count;
    } catch (err) {
      console.error("Error removing members no longer on roster:", err);
    }

    return NextResponse.json({
      success: true,
      syncedCount,
      totalMembers: iracingMembers.length,
      failedCount: syncResults.filter((r) => !r.success).length,
      removedCount,
    });
  } catch (error) {
    if (error instanceof IracingApiError) {
      const message =
        error.status === 401 || error.status === 403
          ? "Your iRacing session has expired. Please sign out and sign back in, then try syncing again."
          : "Unable to fetch members from iRacing right now. Please try again in a moment.";

      return NextResponse.json(
        {
          error: "failed_to_fetch_members_from_iracing",
          message,
        },
        { status: error.status },
      );
    }

    console.error("Error syncing league members:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
