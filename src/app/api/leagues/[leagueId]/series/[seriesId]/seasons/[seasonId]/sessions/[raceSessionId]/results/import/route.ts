import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";
import { fetchIracingLinkedJson } from "@/lib/iracing/api";

function toInputJsonValue(value: Prisma.JsonValue): Prisma.InputJsonValue {
  if (value === null) return null as unknown as Prisma.InputJsonValue;
  return value as Prisma.InputJsonValue;
}

// iRacing event result shape
interface IracingResultEntry {
  cust_id?: number;
  team_id?: number;
  display_name: string;
  finish_position_in_class: number;
  starting_position_in_class?: number;
  starting_position?: number;
  laps_complete: number;
  incidents: number;
  car_name?: string;
  car_id?: number;
  car_number?: string;
  fastest_lap_time?: number;
  average_lap_time?: number;
}

interface IracingSimSession {
  simsession_number: number;
  simsession_name: string;
  simsession_type: number;
  simsession_type_name: string;
  results: IracingResultEntry[];
}

interface IracingEventResult {
  subsession_id: number;
  session_id?: number;
  track?: { track_id?: number; track_name?: string };
  session_results: IracingSimSession[];
}

interface IracingEventResultWrapper {
  type?: string;
  data?: IracingEventResult;
  // Some responses return flat (not wrapped)
  subsession_id?: number;
  session_results?: IracingSimSession[];
}

interface NormalizedResult {
  custId: number;
  displayName: string;
  finishPosition: number;
  startPosition?: number;
  lapsCompleted?: number;
  incidents?: number;
  rawResult?: object;
}

function resolvePositionPoints(
  positionPoints: unknown,
  finishPosition: number,
): number {
  if (!finishPosition || finishPosition < 1) return 0;
  if (!positionPoints || typeof positionPoints !== "object") return 0;
  const asMap = positionPoints as Record<string, unknown>;
  const value = asMap[String(finishPosition)];
  return typeof value === "number" ? value : 0;
}

function parseIracingJson(raw: unknown): NormalizedResult[] {
  const wrapper = raw as IracingEventResultWrapper;
  const data: IracingEventResult | undefined =
    wrapper.data ??
    (wrapper.subsession_id != null
      ? (wrapper as IracingEventResult)
      : undefined);

  if (!data || !Array.isArray(data.session_results)) return [];

  // Prefer simsession_type 6 (Race), fallback to the last session
  const raceSessions = data.session_results.filter(
    (s) => s.simsession_type === 6,
  );
  const target =
    raceSessions.length > 0
      ? raceSessions[raceSessions.length - 1]
      : data.session_results[data.session_results.length - 1];

  if (!target?.results) return [];

  return target.results
    .filter((r) => {
      const id = r.cust_id ?? r.team_id;
      return id != null && id > 0;
    })
    .map((r) => ({
      custId: (r.cust_id ?? r.team_id)!,
      displayName: r.display_name ?? "Unknown",
      finishPosition: r.finish_position_in_class + 1, // 0-indexed → 1-indexed
      startPosition:
        r.starting_position_in_class != null
          ? r.starting_position_in_class + 1
          : r.starting_position != null
            ? r.starting_position + 1
            : undefined,
      lapsCompleted: r.laps_complete,
      incidents: r.incidents,
      rawResult: r as object,
    }));
}

function parseCsv(content: string): NormalizedResult[] {
  const lines = content.split("\n").map((l) => l.trim());

  // Find the header row: must contain "Fin Pos" or "Cust ID"
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("Fin Pos") && lines[i].includes("Cust ID")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  // Parse headers from CSV (handles quoted values)
  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[headerIdx]);
  const colIdx = (name: string) =>
    headers.findIndex((h) => h.replace(/"/g, "").trim() === name);

  const finIdx = colIdx("Fin Pos");
  const custIdx = colIdx("Cust ID");
  const nameIdx = colIdx("Name");
  const startIdx = colIdx("Start Pos");
  const lapsIdx = colIdx("Laps Comp");
  const incIdx = colIdx("Inc");

  const results: NormalizedResult[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = parseRow(line);

    const custIdStr = custIdx >= 0 ? cols[custIdx]?.replace(/"/g, "") : "";
    const custId = parseInt(custIdStr ?? "", 10);
    if (isNaN(custId) || custId <= 0) continue;

    const finStr = finIdx >= 0 ? cols[finIdx]?.replace(/"/g, "") : "";
    const finishPosition = parseInt(finStr ?? "", 10);
    if (isNaN(finishPosition) || finishPosition <= 0) continue;

    const displayName =
      nameIdx >= 0
        ? (cols[nameIdx]?.replace(/"/g, "") ?? "Unknown")
        : "Unknown";
    const startPos =
      startIdx >= 0
        ? parseInt(cols[startIdx]?.replace(/"/g, "") ?? "", 10)
        : NaN;
    const laps =
      lapsIdx >= 0 ? parseInt(cols[lapsIdx]?.replace(/"/g, "") ?? "", 10) : NaN;
    const inc =
      incIdx >= 0 ? parseInt(cols[incIdx]?.replace(/"/g, "") ?? "", 10) : NaN;

    results.push({
      custId,
      displayName,
      finishPosition,
      startPosition: isNaN(startPos) ? undefined : startPos,
      lapsCompleted: isNaN(laps) ? undefined : laps,
      incidents: isNaN(inc) ? undefined : inc,
    });
  }

  return results;
}

async function assertAdmin(leagueId: string, request: NextRequest) {
  const accessToken = request.cookies.get("irh_access_token")?.value;
  if (!accessToken) return { ok: false as const, status: 401 };

  const iracingCustId = getIracingCustIdFromJwt(accessToken);
  const user = await prisma.user.findUnique({
    where: { iracingCustId },
    select: { id: true },
  });
  if (!user) return { ok: false as const, status: 404 };

  const membership = await prisma.leagueMembership.findUnique({
    where: { userId_leagueId: { userId: user.id, leagueId } },
    select: { owner: true, admin: true },
  });
  if (!membership || (!membership.owner && !membership.admin)) {
    return { ok: false as const, status: 403 };
  }

  return { ok: true as const, accessToken };
}

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      leagueId: string;
      seriesId: string;
      seasonId: string;
      raceSessionId: string;
    }>;
  },
) {
  const { leagueId, raceSessionId } = await params;

  const auth = await assertAdmin(leagueId, request);
  if (!auth.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: auth.status });
  }

  const raceSession = await prisma.raceSession.findFirst({
    where: { id: raceSessionId, leagueId },
    include: {
      pointsConfig: true,
      schedule: { select: { pointsCount: true } },
    },
  });
  if (!raceSession) {
    return NextResponse.json(
      { error: "race_session_not_found" },
      { status: 404 },
    );
  }

  let normalizedResults: NormalizedResult[] = [];

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as {
      source: "iracing" | "json" | "csv";
      subsessionId?: number;
      data?: unknown;
      csvContent?: string;
    };

    if (body.source === "iracing") {
      if (!body.subsessionId) {
        return NextResponse.json(
          { error: "subsessionId required" },
          { status: 400 },
        );
      }
      const raw = await fetchIracingLinkedJson<IracingEventResultWrapper>(
        auth.accessToken,
        `/data/results/get?subsession_id=${body.subsessionId}`,
      );
      normalizedResults = parseIracingJson(raw);

      // Update subsessionId on the race session if not set
      if (!raceSession.subsessionId) {
        await prisma.raceSession.update({
          where: { id: raceSessionId },
          data: { subsessionId: body.subsessionId },
        });
      }
    } else if (body.source === "json") {
      normalizedResults = parseIracingJson(body.data);
    } else if (body.source === "csv") {
      if (!body.csvContent || typeof body.csvContent !== "string") {
        return NextResponse.json(
          { error: "csvContent required" },
          { status: 400 },
        );
      }
      normalizedResults = parseCsv(body.csvContent);
    } else {
      return NextResponse.json({ error: "invalid source" }, { status: 400 });
    }
  } else if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "no file provided" }, { status: 400 });
    }
    const text = await file.text();
    const filename = file.name.toLowerCase();
    if (filename.endsWith(".csv")) {
      normalizedResults = parseCsv(text);
    } else if (filename.endsWith(".json")) {
      const parsed: unknown = JSON.parse(text);
      normalizedResults = parseIracingJson(parsed);
    } else {
      return NextResponse.json(
        { error: "unsupported file type, use .json or .csv" },
        { status: 400 },
      );
    }
  } else {
    return NextResponse.json(
      { error: "unsupported content type" },
      { status: 400 },
    );
  }

  if (normalizedResults.length === 0) {
    return NextResponse.json(
      {
        error: "no_results_parsed",
        message: "No valid results could be parsed from the provided data.",
      },
      { status: 422 },
    );
  }

  // Resolve league members for memberId linking
  const custIds = normalizedResults.map((r) => r.custId);
  const members = await prisma.member.findMany({
    where: { leagueId, custId: { in: custIds } },
    select: { id: true, custId: true },
  });
  const memberByCustId = new Map(members.map((m) => [m.custId, m.id]));

  let positionPoints = raceSession.pointsConfig?.positionPoints ?? null;

  // Self-heal for older/manual sessions that were created without pointsConfig
  if (!positionPoints) {
    const series = await prisma.series.findFirst({
      where: { id: raceSession.seriesId, leagueId },
      include: {
        pointsSystem: {
          select: {
            positionPoints: true,
            bonusPoints: true,
          },
        },
      },
    });

    if (series?.pointsSystem) {
      await prisma.raceSessionPoints.upsert({
        where: { raceSessionId },
        create: {
          raceSessionId,
          positionPoints: toInputJsonValue(series.pointsSystem.positionPoints),
          bonusPoints: toInputJsonValue(series.pointsSystem.bonusPoints),
          allowProvisionals: true,
        },
        update: {
          positionPoints: toInputJsonValue(series.pointsSystem.positionPoints),
          bonusPoints: toInputJsonValue(series.pointsSystem.bonusPoints),
        },
      });

      positionPoints = series.pointsSystem.positionPoints;
    }
  }

  const shouldCountPoints = raceSession.schedule?.pointsCount ?? true;

  // Upsert each result
  const upserted = await prisma.$transaction(
    normalizedResults.map((r) => {
      const pointsBase = shouldCountPoints
        ? resolvePositionPoints(positionPoints ?? {}, r.finishPosition)
        : 0;
      const finalPoints = pointsBase;
      const memberId = memberByCustId.get(r.custId) ?? null;

      return prisma.raceSessionResult.upsert({
        where: {
          raceSessionId_custId: { raceSessionId, custId: r.custId },
        },
        create: {
          raceSessionId,
          custId: r.custId,
          displayName: r.displayName,
          memberId,
          finishPosition: r.finishPosition,
          startPosition: r.startPosition,
          lapsCompleted: r.lapsCompleted,
          incidents: r.incidents,
          pointsBase,
          pointsAdjustment: 0,
          finalPoints,
          rawResult: r.rawResult ?? {},
        },
        update: {
          displayName: r.displayName,
          memberId,
          finishPosition: r.finishPosition,
          startPosition: r.startPosition,
          lapsCompleted: r.lapsCompleted,
          incidents: r.incidents,
          pointsBase,
          rawResult: r.rawResult ?? {},
          finalPoints,
        },
      });
    }),
  );

  // Mark session as having results
  await prisma.raceSession.update({
    where: { id: raceSessionId },
    data: { hasResults: true },
  });

  return NextResponse.json({ imported: upserted.length, results: upserted });
}
