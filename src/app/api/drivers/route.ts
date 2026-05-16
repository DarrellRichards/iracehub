import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";

/**
 * GET /api/drivers?q=search&limit=30
 * Search drivers by display name, nickname, or car number.
 * Requires a valid session.
 */
export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("irh_access_token")?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const iracingCustId = getIracingCustIdFromJwt(accessToken);
  if (!iracingCustId) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const limit = Math.min(
    Math.max(
      1,
      parseInt(request.nextUrl.searchParams.get("limit") ?? "30", 10),
    ),
    100,
  );

  try {
    // If q is a plain integer treat it as a custId exact lookup
    const asInt = /^\d+$/.test(q) ? parseInt(q, 10) : null;

    // Build the set of custIds to fetch from User table
    let custIdSet: Set<number> | null = null;

    if (q) {
      if (asInt) {
        custIdSet = new Set([asInt]);
      } else {
        // Parallel: search displayName on User AND nickName/carNumber on Member
        const [userHits, memberHits] = await Promise.all([
          prisma.user.findMany({
            where: { displayName: { contains: q, mode: "insensitive" } },
            select: { iracingCustId: true },
            take: limit,
          }),
          prisma.member.findMany({
            where: {
              OR: [
                { nickName: { contains: q, mode: "insensitive" } },
                { carNumber: { contains: q, mode: "insensitive" } },
              ],
            },
            select: { custId: true },
            distinct: ["custId"],
            take: limit,
          }),
        ]);

        custIdSet = new Set<number>([
          ...userHits.map((u) => u.iracingCustId),
          ...memberHits.map((m) => m.custId),
        ]);
      }
    }

    // Fetch full User rows for the resolved custIds (or all if no query)
    const users = await prisma.user.findMany({
      where: custIdSet ? { iracingCustId: { in: [...custIdSet] } } : undefined,
      select: {
        iracingCustId: true,
        displayName: true,
        country: true,
        memberSince: true,
      },
      orderBy: { displayName: "asc" },
      take: limit,
    });

    // Count distinct leagues each custId appears in via Member table
    const custIds = users.map((u) => u.iracingCustId);
    const leagueCounts = await prisma.member.groupBy({
      by: ["custId"],
      where: { custId: { in: custIds } },
      _count: { leagueId: true },
    });
    const leagueCountMap = new Map(
      leagueCounts.map((r) => [r.custId, r._count.leagueId]),
    );

    const results = users.map((u) => ({
      custId: u.iracingCustId,
      displayName: u.displayName ?? `Driver #${u.iracingCustId}`,
      country: u.country ?? null,
      memberSince: u.memberSince ? u.memberSince.toISOString() : null,
      leagueCount: leagueCountMap.get(u.iracingCustId) ?? 0,
    }));

    return NextResponse.json({ results, total: results.length });
  } catch (error) {
    console.error("[drivers.search]", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}
