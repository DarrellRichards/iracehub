import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parsePositiveInt(searchParams.get("page"), 1);
    const requestedLimit = parsePositiveInt(
      searchParams.get("limit"),
      DEFAULT_LIMIT,
    );
    const limit = Math.min(requestedLimit, MAX_LIMIT);
    const search = (searchParams.get("search") ?? "").trim();

    let where: Prisma.LeagueWhereInput | undefined;
    if (search) {
      const orFilters: Prisma.LeagueWhereInput[] = [
        {
          leagueName: {
            contains: search,
            mode: "insensitive",
          },
        },
      ];

      const numericLeagueId = Number.parseInt(search, 10);
      if (Number.isInteger(numericLeagueId)) {
        orFilters.push({ iracingLeagueId: numericLeagueId });
      }

      where = { OR: orFilters };
    }

    const [totalCount, leagues] = await Promise.all([
      prisma.league.count({ where }),
      prisma.league.findMany({
        where,
        orderBy: [{ leagueName: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          iracingLeagueId: true,
          leagueName: true,
          smallLogo: true,
          rosterCount: true,
          recruiting: true,
          privateSchedule: true,
          privateResults: true,
          virtualModeEnabled: true,
          createdAtIracing: true,
          createdAt: true,
        },
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalCount / limit));

    return NextResponse.json({
      leagues,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      search,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return NextResponse.json(
      { error: "failed_to_fetch_leagues", message },
      { status: 500 },
    );
  }
}
