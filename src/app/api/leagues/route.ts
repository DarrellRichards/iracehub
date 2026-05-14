import { PermissionType, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  fetchLeagueMembershipsFromIracing,
  getIracingCustIdFromJwt,
} from "@/lib/auth/iracing";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("irh_access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const iracingCustId = getIracingCustIdFromJwt(accessToken);

    const user = await prisma.user.findUnique({
      where: { iracingCustId },
      select: {
        id: true,
        leagueMemberships: {
          select: {
            owner: true,
            admin: true,
            lastSyncedAt: true,
            league: {
              select: {
                id: true,
                iracingLeagueId: true,
                leagueName: true,
                smallLogo: true,
                rosterCount: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    const leagues = user.leagueMemberships.map((m) => ({
      id: m.league.id,
      iracingLeagueId: m.league.iracingLeagueId,
      leagueName: m.league.leagueName,
      smallLogo: m.league.smallLogo,
      rosterCount: m.league.rosterCount,
      owner: m.owner,
      admin: m.admin,
      lastSyncedAt: m.lastSyncedAt,
    }));

    return NextResponse.json({ leagues });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("Failed to fetch user leagues:", message);
    return NextResponse.json(
      { error: "fetch_failed", message },
      { status: 500 },
    );
  }
}

interface CreateLeagueBody {
  leagueId?: number;
}

function parseDateOrNull(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get("irh_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: CreateLeagueBody;
  try {
    body = (await request.json()) as CreateLeagueBody;
  } catch {
    return NextResponse.json({ error: "invalid_json_body" }, { status: 400 });
  }

  if (!Number.isInteger(body.leagueId)) {
    return NextResponse.json({ error: "invalid_league_id" }, { status: 400 });
  }

  try {
    const iracingCustId = getIracingCustIdFromJwt(accessToken);

    const user = await prisma.user.findUnique({
      where: { iracingCustId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    const memberships = await fetchLeagueMembershipsFromIracing(accessToken);

    // The membership endpoint is already scoped to the authenticated user.
    // Matching on cust_id is unnecessary and can silently fail when the field
    // comes back as a string or is absent in certain league types.
    const selectedMembership = memberships.find(
      (membership) =>
        membership.league_id === body.leagueId &&
        membership.league &&
        (membership.owner || membership.admin),
    );

    console.log(
      "[league create] requested leagueId:",
      body.leagueId,
      "| matched membership:",
      JSON.stringify(selectedMembership ?? null),
    );

    if (!selectedMembership || !selectedMembership.league) {
      return NextResponse.json(
        { error: "forbidden_not_owner_or_admin" },
        { status: 403 },
      );
    }

    const leagueData = selectedMembership.league;
    const rawLeagueJson = JSON.parse(
      JSON.stringify(leagueData),
    ) as Prisma.InputJsonValue;

    const existingLeague = await prisma.league.findUnique({
      where: { iracingLeagueId: body.leagueId },
      select: { id: true },
    });

    if (existingLeague) {
      return NextResponse.json(
        { error: "league_already_exists" },
        { status: 409 },
      );
    }

    const createdLeague = await prisma.$transaction(async (tx) => {
      const league = await tx.league.create({
        data: {
          iracingLeagueId: selectedMembership.league_id,
          leagueName: leagueData.league_name,
          ownerCustId: leagueData.owner_cust_id,
          createdAtIracing: parseDateOrNull(leagueData.created),
          hidden: leagueData.hidden,
          message: leagueData.message,
          about: leagueData.about,
          url: leagueData.url,
          recruiting: leagueData.recruiting,
          rules: leagueData.rules,
          privateWall: leagueData.private_wall,
          privateRoster: leagueData.private_roster,
          privateSchedule: leagueData.private_schedule,
          privateResults: leagueData.private_results,
          rosterCount: leagueData.roster_count,
          smallLogo: leagueData.small_logo,
          largeLogo: leagueData.large_logo,
          rawLeague: rawLeagueJson,
          creatorUserId: user.id,
        },
      });

      await tx.leagueMembership.upsert({
        where: {
          userId_leagueId: {
            userId: user.id,
            leagueId: league.id,
          },
        },
        create: {
          userId: user.id,
          leagueId: league.id,
          owner: selectedMembership.owner,
          admin: selectedMembership.admin,
          leagueMailOptOut: selectedMembership.league_mail_opt_out,
          leaguePmOptOut: selectedMembership.league_pm_opt_out,
          carNumber: selectedMembership.car_number,
          nickName: selectedMembership.nick_name,
          isMember: selectedMembership.is_member,
          isApplicant: selectedMembership.is_applicant,
          isInvite: selectedMembership.is_invite,
          isIgnored: selectedMembership.is_ignored,
          lastSyncedAt: new Date(),
        },
        update: {
          owner: selectedMembership.owner,
          admin: selectedMembership.admin,
          leagueMailOptOut: selectedMembership.league_mail_opt_out,
          leaguePmOptOut: selectedMembership.league_pm_opt_out,
          carNumber: selectedMembership.car_number,
          nickName: selectedMembership.nick_name,
          isMember: selectedMembership.is_member,
          isApplicant: selectedMembership.is_applicant,
          isInvite: selectedMembership.is_invite,
          isIgnored: selectedMembership.is_ignored,
          lastSyncedAt: new Date(),
        },
      });

      await tx.userPermission.upsert({
        where: {
          userId_permission: {
            userId: user.id,
            permission: PermissionType.ADMIN_ROUTES,
          },
        },
        create: {
          userId: user.id,
          permission: PermissionType.ADMIN_ROUTES,
          sourceLeagueId: league.id,
          granted: true,
        },
        update: {
          sourceLeagueId: league.id,
          granted: true,
        },
      });

      return league;
    });

    console.info("[audit][league.create]", {
      timestamp: new Date().toISOString(),
      userId: user.id,
      iracingCustId,
      createdLeagueId: createdLeague.id,
      iracingLeagueId: createdLeague.iracingLeagueId,
      leagueName: createdLeague.leagueName,
    });

    return NextResponse.json({
      id: createdLeague.id,
      leagueId: createdLeague.iracingLeagueId,
      leagueName: createdLeague.leagueName,
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "league_already_exists" },
        { status: 409 },
      );
    }

    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("Failed to create league:", message);
    return NextResponse.json(
      { error: "league_create_failed", message },
      { status: 500 },
    );
  }
}
