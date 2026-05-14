import { NextRequest, NextResponse } from "next/server";
import { Prisma, TeamInviteStatus, TeamRole } from "@prisma/client";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";
import { prisma } from "@/lib/prisma";

function sortTeamMembers<
  T extends {
    role: TeamRole;
    member: { displayName: string };
  },
>(members: T[]): T[] {
  return [...members].sort((left, right) => {
    if (left.role !== right.role) {
      return left.role === TeamRole.CAPTAIN ? -1 : 1;
    }
    return left.member.displayName.localeCompare(right.member.displayName);
  });
}

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
    select: { id: true, iracingCustId: true, displayName: true },
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
      carNumber: true,
      nickName: true,
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

  return { user, league, member };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  try {
    const { leagueId } = await params;
    const ctx = await getLeagueContext(request, leagueId);
    if ("error" in ctx) return ctx.error;

    const targetCustIdRaw = request.nextUrl.searchParams.get("targetCustId");
    const targetCustId = targetCustIdRaw ? parseInt(targetCustIdRaw, 10) : null;

    const [
      myTeamRecord,
      receivedInvites,
      targetMemberBase,
      allTeams,
      allLeagueMembers,
    ] = await Promise.all([
      prisma.team.findFirst({
        where: {
          leagueId: ctx.league.id,
          members: {
            some: {
              memberId: ctx.member.id,
            },
          },
        },
        select: {
          id: true,
          name: true,
          leagueId: true,
          captainMemberId: true,
          virtualBank: true,
          totalEarned: true,
          members: {
            select: {
              id: true,
              memberId: true,
              role: true,
              joinedAt: true,
              member: {
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
          invitations: {
            where: { status: TeamInviteStatus.PENDING },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              status: true,
              createdAt: true,
              invitedMember: {
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
        },
      }),
      prisma.teamInvite.findMany({
        where: {
          invitedMemberId: ctx.member.id,
          status: TeamInviteStatus.PENDING,
          team: { leagueId: ctx.league.id },
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
        },
      }),
      Number.isInteger(targetCustId)
        ? prisma.member.findUnique({
            where: {
              leagueId_custId: {
                leagueId: ctx.league.id,
                custId: targetCustId!,
              },
            },
            select: {
              id: true,
              custId: true,
              displayName: true,
              carNumber: true,
              nickName: true,
            },
          })
        : Promise.resolve(null),
      prisma.team.findMany({
        where: { leagueId: ctx.league.id },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          captainMemberId: true,
          virtualBank: true,
          totalEarned: true,
          members: {
            select: {
              id: true,
              role: true,
              joinedAt: true,
              member: {
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
        },
      }),
      prisma.member.findMany({
        where: { leagueId: ctx.league.id },
        orderBy: { displayName: "asc" },
        select: {
          id: true,
          custId: true,
          displayName: true,
          carNumber: true,
          nickName: true,
        },
      }),
    ]);

    const targetTeamMembership = targetMemberBase
      ? await prisma.team.findFirst({
          where: {
            leagueId: ctx.league.id,
            members: {
              some: {
                memberId: targetMemberBase.id,
              },
            },
          },
          select: {
            id: true,
            name: true,
            members: {
              where: { memberId: targetMemberBase.id },
              select: {
                role: true,
              },
              take: 1,
            },
          },
        })
      : null;

    const targetMember = targetMemberBase
      ? {
          ...targetMemberBase,
          teamMembership: targetTeamMembership
            ? {
                role: targetTeamMembership.members[0]?.role ?? TeamRole.DRIVER,
                team: {
                  id: targetTeamMembership.id,
                  name: targetTeamMembership.name,
                },
              }
            : null,
        }
      : null;

    const viewerMembership = myTeamRecord?.members.find(
      (entry) => entry.memberId === ctx.member.id,
    );

    const myTeam =
      myTeamRecord &&
      myTeamRecord.leagueId === ctx.league.id &&
      viewerMembership
        ? {
            id: myTeamRecord.id,
            name: myTeamRecord.name,
            captainMemberId: myTeamRecord.captainMemberId,
            virtualBank: myTeamRecord.virtualBank,
            totalEarned: myTeamRecord.totalEarned,
            myRole: viewerMembership.role,
            isCaptain: viewerMembership.role === TeamRole.CAPTAIN,
            members: sortTeamMembers(myTeamRecord.members),
            pendingInvites: myTeamRecord.invitations,
          }
        : null;

    const memberTeamLookup = new Map<
      string,
      {
        team: { id: string; name: string };
      }
    >();

    for (const team of allTeams) {
      for (const entry of team.members) {
        memberTeamLookup.set(entry.member.id, {
          team: {
            id: team.id,
            name: team.name,
          },
        });
      }
    }

    const pendingInviteMemberIds = new Set(
      (myTeam?.pendingInvites ?? []).map((invite) => invite.invitedMember.id),
    );

    const inviteCandidates = allLeagueMembers.map((leagueMember) => {
      const teamMembership = memberTeamLookup.get(leagueMember.id) ?? null;
      const hasPendingInviteFromMyTeam = pendingInviteMemberIds.has(
        leagueMember.id,
      );
      const canInvite = Boolean(
        myTeam?.isCaptain &&
        leagueMember.id !== ctx.member.id &&
        !teamMembership &&
        !hasPendingInviteFromMyTeam,
      );

      return {
        ...leagueMember,
        teamMembership,
        hasPendingInviteFromMyTeam,
        canInvite,
      };
    });

    return NextResponse.json({
      league: ctx.league,
      viewer: ctx.member,
      myTeam,
      pendingInvites: receivedInvites,
      targetMember,
      inviteCandidates,
      teams: allTeams.map((team) => ({
        ...team,
        members: sortTeamMembers(team.members),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("[teams route]", message);
    return NextResponse.json(
      { error: "failed_to_load_teams", message },
      { status: 500 },
    );
  }
}

interface CreateTeamBody {
  name?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;
  const ctx = await getLeagueContext(request, leagueId);
  if ("error" in ctx) return ctx.error;

  let body: CreateTeamBody;
  try {
    body = (await request.json()) as CreateTeamBody;
  } catch {
    return NextResponse.json({ error: "invalid_json_body" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name || name.length < 2 || name.length > 40) {
    return NextResponse.json({ error: "invalid_team_name" }, { status: 400 });
  }

  const existingTeamMembership = await prisma.team.findFirst({
    where: {
      leagueId: ctx.league.id,
      members: {
        some: {
          memberId: ctx.member.id,
        },
      },
    },
    select: { id: true },
  });

  if (existingTeamMembership) {
    return NextResponse.json({ error: "already_on_team" }, { status: 409 });
  }

  try {
    const team = await prisma.$transaction(async (tx) => {
      const createdTeam = await tx.team.create({
        data: {
          leagueId: ctx.league.id,
          name,
          captainMemberId: ctx.member.id,
        },
        select: { id: true, name: true, captainMemberId: true },
      });

      await tx.teamMember.create({
        data: {
          teamId: createdTeam.id,
          memberId: ctx.member.id,
          role: TeamRole.CAPTAIN,
        },
      });

      return createdTeam;
    });

    console.info("[audit][team.create]", {
      timestamp: new Date().toISOString(),
      leagueId: ctx.league.id,
      teamId: team.id,
      teamName: team.name,
      captainMemberId: ctx.member.id,
      captainCustId: ctx.member.custId,
    });

    return NextResponse.json({
      success: true,
      team,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "team_name_taken" }, { status: 409 });
    }

    console.error("[team create]", error);
    return NextResponse.json({ error: "team_create_failed" }, { status: 500 });
  }
}
