import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  fetchLeagueMembershipsFromIracing,
  getIracingCustIdFromJwt,
} from "@/lib/auth/iracing";
import { prisma } from "@/lib/prisma";

interface LinkLeagueBody {
  iracingLeagueId?: number;
}

function parseDateOrNull(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const accessToken = request.cookies.get("irh_access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { leagueId } = await params;

  let body: LinkLeagueBody;
  try {
    body = (await request.json()) as LinkLeagueBody;
  } catch {
    return NextResponse.json({ error: "invalid_json_body" }, { status: 400 });
  }

  if (!Number.isInteger(body.iracingLeagueId)) {
    return NextResponse.json(
      { error: "invalid_iracing_league_id" },
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

    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true },
    });

    if (!league) {
      return NextResponse.json({ error: "league_not_found" }, { status: 404 });
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

    if (!membership || (!membership.owner && !membership.admin)) {
      return NextResponse.json(
        { error: "forbidden_not_owner_or_admin" },
        { status: 403 },
      );
    }

    const memberships = await fetchLeagueMembershipsFromIracing(accessToken);
    const selectedMembership = memberships.find(
      (item) =>
        item.league_id === body.iracingLeagueId &&
        item.league &&
        (item.owner || item.admin),
    );

    if (!selectedMembership || !selectedMembership.league) {
      return NextResponse.json(
        { error: "forbidden_not_owner_or_admin_on_iracing_league" },
        { status: 403 },
      );
    }

    const existingLeague = await prisma.league.findUnique({
      where: { iracingLeagueId: body.iracingLeagueId },
      select: { id: true },
    });

    if (existingLeague && existingLeague.id !== leagueId) {
      return NextResponse.json(
        { error: "iracing_league_already_linked" },
        { status: 409 },
      );
    }

    const leagueData = selectedMembership.league;
    const rawLeagueJson = JSON.parse(
      JSON.stringify(leagueData),
    ) as Prisma.InputJsonValue;

    const updatedLeague = await prisma.$transaction(async (tx) => {
      const updated = await tx.league.update({
        where: { id: leagueId },
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
          updatedAt: new Date(),
        },
      });

      await tx.leagueMembership.upsert({
        where: {
          userId_leagueId: {
            userId: user.id,
            leagueId,
          },
        },
        create: {
          userId: user.id,
          leagueId,
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

      return updated;
    });

    return NextResponse.json({
      id: updatedLeague.id,
      iracingLeagueId: updatedLeague.iracingLeagueId,
      routeLeagueId: updatedLeague.iracingLeagueId
        ? String(updatedLeague.iracingLeagueId)
        : updatedLeague.id,
      leagueName: updatedLeague.leagueName,
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "iracing_league_already_linked" },
        { status: 409 },
      );
    }

    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("Failed to link league to iRacing league:", message);
    return NextResponse.json(
      { error: "league_iracing_link_failed", message },
      { status: 500 },
    );
  }
}
