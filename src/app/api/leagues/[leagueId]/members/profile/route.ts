import { NextRequest, NextResponse } from "next/server";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";
import { fetchMemberProfileFromIracing } from "@/lib/auth/iracing";
import { prisma } from "@/lib/prisma";

async function getLeagueMemberContext(request: NextRequest, leagueId: string) {
  const accessToken = request.cookies.get("irh_access_token")?.value;
  if (!accessToken) {
    return {
      error: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  const iracingCustId = getIracingCustIdFromJwt(accessToken);
  const user = await prisma.user.findUnique({
    where: { iracingCustId },
    select: { id: true, iracingCustId: true },
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
    select: { id: true },
  });

  if (!membership) {
    return {
      error: NextResponse.json({ error: "not_a_member" }, { status: 403 }),
    };
  }

  return { user };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;

  try {
    const context = await getLeagueMemberContext(request, leagueId);
    if ("error" in context) {
      return context.error;
    }

    const targetCustIdRaw = request.nextUrl.searchParams.get("custId");
    const targetCustId = targetCustIdRaw
      ? Number.parseInt(targetCustIdRaw, 10)
      : context.user.iracingCustId;

    if (!Number.isInteger(targetCustId) || targetCustId <= 0) {
      return NextResponse.json({ error: "invalid_cust_id" }, { status: 400 });
    }

    const [leagueSettings, targetMember, viewerMember, targetUser] =
      await Promise.all([
        prisma.league.findUnique({
          where: { id: leagueId },
          select: {
            id: true,
            virtualModeEnabled: true,
            virtualStartingMoney: true,
          },
        }),
        prisma.member.findUnique({
          where: {
            leagueId_custId: {
              leagueId,
              custId: targetCustId,
            },
          },
          select: {
            id: true,
            custId: true,
            displayName: true,
            profileHeadline: true,
            profileBio: true,
            carNumber: true,
            nickName: true,
            lastSyncedAt: true,
            earnedVirtual: true,
          },
        }),
        prisma.member.findUnique({
          where: {
            leagueId_custId: {
              leagueId,
              custId: context.user.iracingCustId,
            },
          },
          select: { id: true, custId: true },
        }),
        prisma.user.findUnique({
          where: { iracingCustId: targetCustId },
          select: { country: true },
        }),
      ]);

    if (!leagueSettings) {
      return NextResponse.json({ error: "league_not_found" }, { status: 404 });
    }

    if (!targetMember) {
      return NextResponse.json({ error: "member_not_found" }, { status: 404 });
    }

    if (!viewerMember) {
      return NextResponse.json(
        { error: "viewer_member_not_found" },
        { status: 404 },
      );
    }

    const [raceCount, moneyEvents] = await Promise.all([
      prisma.raceSessionResult.count({
        where: {
          raceSession: { leagueId },
          memberId: targetMember.id,
        },
      }),
      prisma.virtualMoneyEvent.findMany({
        where: {
          leagueId,
          memberId: targetMember.id,
        },
        select: {
          amount: true,
          eventType: true,
        },
      }),
    ]);

    let totalLedgerAmount = 0;
    let totalEntryDebits = 0;
    let totalEntryRefunds = 0;

    for (const event of moneyEvents) {
      totalLedgerAmount += event.amount;

      if (event.eventType === "ENTRY_FEE_DEBIT") {
        totalEntryDebits += Math.max(0, -event.amount);
      }

      if (event.eventType === "ENTRY_FEE_REFUND") {
        totalEntryRefunds += Math.max(0, event.amount);
      }
    }

    const totalPayout = leagueSettings.virtualModeEnabled
      ? targetMember.earnedVirtual
      : 0;
    const netEarned = totalPayout + totalLedgerAmount;
    const currentBalance =
      leagueSettings.virtualStartingMoney + totalPayout + totalLedgerAmount;

    return NextResponse.json({
      league: {
        id: leagueSettings.id,
        virtualModeEnabled: leagueSettings.virtualModeEnabled,
      },
      targetProfile: {
        id: targetMember.id,
        custId: targetMember.custId,
        displayName: targetMember.displayName,
        country: targetUser?.country ?? null,
        carNumber: targetMember.carNumber,
        nickName: targetMember.nickName,
        profileHeadline: targetMember.profileHeadline,
        profileBio: targetMember.profileBio,
        lastSyncedAt: targetMember.lastSyncedAt,
      },
      virtualMoney: {
        raceCount,
        totalPayout,
        totalEntryCost: Math.max(0, totalEntryDebits - totalEntryRefunds),
        netEarned,
        startingBalance: leagueSettings.virtualStartingMoney,
        currentBalance,
      },
      canEdit: viewerMember.custId === targetMember.custId,
    });
  } catch (error) {
    console.error("[members.profile.get]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;

  try {
    const context = await getLeagueMemberContext(request, leagueId);
    if ("error" in context) {
      return context.error;
    }

    const accessToken = request.cookies.get("irh_access_token")?.value;
    if (!accessToken) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const profile = await fetchMemberProfileFromIracing(accessToken);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: context.user.id },
        data: {
          displayName: profile.displayName,
          country: profile.country,
          memberSince: profile.memberSince,
        },
      });

      return tx.member.update({
        where: {
          leagueId_custId: {
            leagueId,
            custId: context.user.iracingCustId,
          },
        },
        data: {
          displayName: profile.displayName ?? undefined,
          lastSyncedAt: new Date(),
        },
        select: {
          id: true,
          custId: true,
          displayName: true,
          profileHeadline: true,
          profileBio: true,
          lastSyncedAt: true,
        },
      });
    });

    return NextResponse.json({
      profile: {
        ...updated,
        country: profile.country,
      },
    });
  } catch (error) {
    console.error("[members.profile.post]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}

interface UpdateProfileBody {
  profileHeadline?: string;
  profileBio?: string;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;

  let body: UpdateProfileBody;
  try {
    body = (await request.json()) as UpdateProfileBody;
  } catch {
    return NextResponse.json({ error: "invalid_json_body" }, { status: 400 });
  }

  const profileHeadline = (body.profileHeadline ?? "").trim();
  const profileBio = (body.profileBio ?? "").trim();

  if (profileHeadline.length > 80) {
    return NextResponse.json(
      { error: "profile_headline_too_long" },
      { status: 400 },
    );
  }

  if (profileBio.length > 1200) {
    return NextResponse.json(
      { error: "profile_bio_too_long" },
      { status: 400 },
    );
  }

  try {
    const context = await getLeagueMemberContext(request, leagueId);
    if ("error" in context) {
      return context.error;
    }

    const viewerMember = await prisma.member.findUnique({
      where: {
        leagueId_custId: {
          leagueId,
          custId: context.user.iracingCustId,
        },
      },
      select: { id: true },
    });

    if (!viewerMember) {
      return NextResponse.json({ error: "member_not_found" }, { status: 404 });
    }

    const updated = await prisma.member.update({
      where: { id: viewerMember.id },
      data: {
        profileHeadline: profileHeadline.length > 0 ? profileHeadline : null,
        profileBio: profileBio.length > 0 ? profileBio : null,
      },
      select: {
        id: true,
        custId: true,
        displayName: true,
        profileHeadline: true,
        profileBio: true,
      },
    });

    return NextResponse.json({
      profile: updated,
    });
  } catch (error) {
    console.error("[members.profile.patch]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}
