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

    const adminLeagueIds = user.leagueMemberships
      .filter((membership) => membership.owner || membership.admin)
      .map((membership) => membership.league.id);

    const pendingCounts =
      adminLeagueIds.length > 0
        ? await prisma.leagueJoinRequest.groupBy({
            by: ["leagueId"],
            where: {
              leagueId: { in: adminLeagueIds },
              status: "PENDING",
            },
            _count: {
              _all: true,
            },
          })
        : [];

    const pendingCountByLeagueId = new Map(
      pendingCounts.map((entry) => [entry.leagueId, entry._count._all]),
    );

    const leagues = user.leagueMemberships.map((m) => ({
      id: m.league.id,
      iracingLeagueId: m.league.iracingLeagueId,
      routeLeagueId: m.league.iracingLeagueId
        ? String(m.league.iracingLeagueId)
        : m.league.id,
      leagueName: m.league.leagueName,
      smallLogo: m.league.smallLogo,
      rosterCount: m.league.rosterCount,
      owner: m.owner,
      admin: m.admin,
      pendingJoinRequests:
        m.owner || m.admin ? (pendingCountByLeagueId.get(m.league.id) ?? 0) : 0,
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
  leagueName?: string;
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

  const requestedLeagueName =
    typeof body.leagueName === "string" ? body.leagueName.trim() : "";
  const isIracingCreate = Number.isInteger(body.leagueId);

  if (!isIracingCreate && !requestedLeagueName) {
    return NextResponse.json(
      { error: "invalid_create_league_payload" },
      { status: 400 },
    );
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

    const createdLeague = isIracingCreate
      ? await (async () => {
          const memberships =
            await fetchLeagueMembershipsFromIracing(accessToken);

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
            throw new Error("forbidden_not_owner_or_admin");
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
            throw new Error("league_already_exists");
          }

          return prisma.$transaction(async (tx) => {
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
        })()
      : await prisma.$transaction(async (tx) => {
          const league = await tx.league.create({
            data: {
              iracingLeagueId: null,
              leagueName: requestedLeagueName,
              creatorUserId: user.id,
            },
          });

          await tx.leagueMembership.create({
            data: {
              userId: user.id,
              leagueId: league.id,
              owner: true,
              admin: true,
              isMember: true,
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
      source: isIracingCreate ? "iracing" : "local",
    });

    return NextResponse.json({
      id: createdLeague.id,
      leagueId: createdLeague.iracingLeagueId ?? createdLeague.id,
      iracingLeagueId: createdLeague.iracingLeagueId,
      leagueName: createdLeague.leagueName,
    });
  } catch (err) {
    if (
      err instanceof Error &&
      err.message === "forbidden_not_owner_or_admin"
    ) {
      return NextResponse.json(
        { error: "forbidden_not_owner_or_admin" },
        { status: 403 },
      );
    }

    if (err instanceof Error && err.message === "league_already_exists") {
      return NextResponse.json(
        { error: "league_already_exists" },
        { status: 409 },
      );
    }

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
