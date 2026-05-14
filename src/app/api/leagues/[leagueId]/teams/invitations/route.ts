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
      name: true,
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
          name: teamMembershipRecord.name,
          leagueId: teamMembershipRecord.leagueId,
          captainMemberId: teamMembershipRecord.captainMemberId,
        },
      }
    : null;

  return { league, member, teamMembership };
}

interface InviteBody {
  invitedCustId?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;
  const ctx = await getLeagueContext(request, leagueId);
  if ("error" in ctx) return ctx.error;

  if (
    !ctx.teamMembership ||
    ctx.teamMembership.role !== TeamRole.CAPTAIN ||
    ctx.teamMembership.team.leagueId !== ctx.league.id
  ) {
    return NextResponse.json({ error: "captain_required" }, { status: 403 });
  }

  let body: InviteBody;
  try {
    body = (await request.json()) as InviteBody;
  } catch {
    return NextResponse.json({ error: "invalid_json_body" }, { status: 400 });
  }

  if (!Number.isInteger(body.invitedCustId)) {
    return NextResponse.json(
      { error: "invalid_invited_cust_id" },
      { status: 400 },
    );
  }

  const invitedCustId = body.invitedCustId as number;

  if (invitedCustId === ctx.member.custId) {
    return NextResponse.json({ error: "cannot_invite_self" }, { status: 400 });
  }

  const invitedMember = await prisma.member.findUnique({
    where: {
      leagueId_custId: {
        leagueId: ctx.league.id,
        custId: invitedCustId,
      },
    },
    select: {
      id: true,
      custId: true,
      displayName: true,
    },
  });

  if (!invitedMember) {
    return NextResponse.json({ error: "member_not_found" }, { status: 404 });
  }

  const existingTeamMembership = await prisma.team.findFirst({
    where: {
      leagueId: ctx.league.id,
      members: {
        some: {
          memberId: invitedMember.id,
        },
      },
    },
    select: { id: true },
  });

  if (existingTeamMembership) {
    return NextResponse.json(
      { error: "driver_already_on_team" },
      { status: 409 },
    );
  }

  const invitation = await prisma.teamInvite.upsert({
    where: {
      teamId_invitedMemberId: {
        teamId: ctx.teamMembership.team.id,
        invitedMemberId: invitedMember.id,
      },
    },
    create: {
      teamId: ctx.teamMembership.team.id,
      invitedMemberId: invitedMember.id,
      invitedByMemberId: ctx.member.id,
      status: TeamInviteStatus.PENDING,
    },
    update: {
      invitedByMemberId: ctx.member.id,
      status: TeamInviteStatus.PENDING,
      respondedAt: null,
    },
    select: {
      id: true,
      teamId: true,
      status: true,
      invitedMember: {
        select: {
          id: true,
          custId: true,
          displayName: true,
        },
      },
    },
  });

  console.info("[audit][team.invite]", {
    timestamp: new Date().toISOString(),
    leagueId: ctx.league.id,
    teamId: invitation.teamId,
    captainMemberId: ctx.member.id,
    invitedMemberId: invitation.invitedMember.id,
    invitedCustId: invitation.invitedMember.custId,
  });

  return NextResponse.json({ success: true, invitation });
}
