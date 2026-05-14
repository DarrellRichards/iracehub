import { NextRequest, NextResponse } from "next/server";
import { TeamInviteStatus, TeamRole } from "@prisma/client";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";
import { prisma } from "@/lib/prisma";

async function getLeagueContext(request: NextRequest, rawLeagueId: string) {
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

  const iracingLeagueIdNum = parseInt(rawLeagueId, 10);
  const league = Number.isNaN(iracingLeagueIdNum)
    ? await prisma.league.findUnique({
        where: { id: rawLeagueId },
        select: { id: true, iracingLeagueId: true, leagueName: true },
      })
    : await prisma.league.findUnique({
        where: { iracingLeagueId: iracingLeagueIdNum },
        select: { id: true, iracingLeagueId: true, leagueName: true },
      });

  if (!league) {
    return {
      error: NextResponse.json({ error: "league_not_found" }, { status: 404 }),
    };
  }

  const membership = await prisma.leagueMembership.findUnique({
    where: { userId_leagueId: { userId: user.id, leagueId: league.id } },
    select: { id: true },
  });

  if (!membership) {
    return {
      error: NextResponse.json({ error: "not_a_member" }, { status: 403 }),
    };
  }

  const member = await prisma.member.findUnique({
    where: {
      leagueId_custId: {
        leagueId: league.id,
        custId: user.iracingCustId,
      },
    },
    select: {
      id: true,
      custId: true,
      displayName: true,
    },
  });

  if (!member) {
    return {
      error: NextResponse.json(
        {
          error: "member_not_synced",
          message: "Please sync league members first.",
        },
        { status: 404 },
      ),
    };
  }

  const teamMembershipRecord = await prisma.team.findFirst({
    where: {
      leagueId: league.id,
      members: {
        some: {
          memberId: member.id,
        },
      },
    },
    select: {
      id: true,
      leagueId: true,
      captainMemberId: true,
      members: {
        where: { memberId: member.id },
        select: {
          role: true,
        },
        take: 1,
      },
    },
  });

  const teamMembership = teamMembershipRecord
    ? {
        role: teamMembershipRecord.members[0]?.role ?? TeamRole.DRIVER,
        team: {
          id: teamMembershipRecord.id,
          leagueId: teamMembershipRecord.leagueId,
          captainMemberId: teamMembershipRecord.captainMemberId,
        },
      }
    : null;

  return { league, member, teamMembership };
}

interface InvitationActionBody {
  action?: "accept" | "decline" | "cancel";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string; invitationId: string }> },
) {
  const { leagueId, invitationId } = await params;
  const ctx = await getLeagueContext(request, leagueId);
  if ("error" in ctx) return ctx.error;

  let body: InvitationActionBody;
  try {
    body = (await request.json()) as InvitationActionBody;
  } catch {
    return NextResponse.json({ error: "invalid_json_body" }, { status: 400 });
  }

  if (!body.action || !["accept", "decline", "cancel"].includes(body.action)) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  const invitation = await prisma.teamInvite.findUnique({
    where: { id: invitationId },
    select: {
      id: true,
      status: true,
      teamId: true,
      invitedMemberId: true,
      invitedByMemberId: true,
      team: {
        select: {
          id: true,
          leagueId: true,
          name: true,
          captainMemberId: true,
        },
      },
    },
  });

  if (!invitation || invitation.team.leagueId !== ctx.league.id) {
    return NextResponse.json(
      { error: "invitation_not_found" },
      { status: 404 },
    );
  }

  if (invitation.status !== TeamInviteStatus.PENDING) {
    return NextResponse.json(
      { error: "invitation_not_pending" },
      { status: 409 },
    );
  }

  const canRespond = invitation.invitedMemberId === ctx.member.id;
  const canCancel =
    invitation.invitedByMemberId === ctx.member.id ||
    (ctx.teamMembership?.role === TeamRole.CAPTAIN &&
      ctx.teamMembership.team.id === invitation.teamId);

  if (body.action === "cancel" && !canCancel) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if ((body.action === "accept" || body.action === "decline") && !canRespond) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (body.action === "accept") {
    if (ctx.teamMembership) {
      return NextResponse.json({ error: "already_on_team" }, { status: 409 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.teamMember.create({
        data: {
          teamId: invitation.teamId,
          memberId: ctx.member.id,
          role: TeamRole.DRIVER,
        },
      });

      await tx.teamInvite.update({
        where: { id: invitation.id },
        data: {
          status: TeamInviteStatus.ACCEPTED,
          respondedAt: new Date(),
        },
      });

      await tx.teamInvite.updateMany({
        where: {
          invitedMemberId: ctx.member.id,
          status: TeamInviteStatus.PENDING,
          id: { not: invitation.id },
          team: { leagueId: ctx.league.id },
        },
        data: {
          status: TeamInviteStatus.CANCELED,
          respondedAt: new Date(),
        },
      });
    });

    return NextResponse.json({
      success: true,
      status: TeamInviteStatus.ACCEPTED,
    });
  }

  await prisma.teamInvite.update({
    where: { id: invitation.id },
    data: {
      status:
        body.action === "decline"
          ? TeamInviteStatus.DECLINED
          : TeamInviteStatus.CANCELED,
      respondedAt: new Date(),
    },
  });

  return NextResponse.json({
    success: true,
    status:
      body.action === "decline"
        ? TeamInviteStatus.DECLINED
        : TeamInviteStatus.CANCELED,
  });
}
