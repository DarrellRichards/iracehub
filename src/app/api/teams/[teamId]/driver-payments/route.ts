import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIracingCustIdFromJwt } from "@/lib/auth/iracing";

interface DriverPaymentRequest {
  memberId: string;
  paymentPercent: number; // 0-100
}

/**
 * GET /api/teams/[teamId]/driver-payments
 * Get driver payment split configuration for a team
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await context.params;
    const accessToken = request.cookies.get("irh_access_token")?.value;

    if (!accessToken) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Verify user is team captain
    const iracingCustId = getIracingCustIdFromJwt(accessToken);
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        captain: {
          select: { custId: true },
        },
      },
    });

    if (!team) {
      return NextResponse.json({ error: "team_not_found" }, { status: 404 });
    }

    if (team.captain.custId !== iracingCustId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const payments = await prisma.teamDriverPayment.findMany({
      where: { teamId },
      include: {
        driver: {
          select: {
            id: true,
            custId: true,
            displayName: true,
            carNumber: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      teamId,
      payments: payments.map((p) => ({
        id: p.id,
        memberId: p.driver.id,
        custId: p.driver.custId,
        displayName: p.driver.displayName,
        carNumber: p.driver.carNumber,
        paymentPercent: p.paymentPercent,
      })),
    });
  } catch (error) {
    console.error("Error fetching driver payments:", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/teams/[teamId]/driver-payments
 * Create or update driver payment split configuration
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await context.params;
    const accessToken = request.cookies.get("irh_access_token")?.value;

    if (!accessToken) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Verify user is team captain
    const iracingCustId = getIracingCustIdFromJwt(accessToken);
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        captain: {
          select: { custId: true },
        },
      },
    });

    if (!team) {
      return NextResponse.json({ error: "team_not_found" }, { status: 404 });
    }

    if (team.captain.custId !== iracingCustId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as DriverPaymentRequest;

    // Validate input
    if (
      !body.memberId ||
      typeof body.paymentPercent !== "number" ||
      body.paymentPercent < 0 ||
      body.paymentPercent > 100
    ) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    // Verify member exists and belongs to this team
    const member = await prisma.member.findUnique({
      where: { id: body.memberId },
      select: { id: true, leagueId: true },
    });

    if (!member || member.leagueId !== team.leagueId) {
      return NextResponse.json(
        { error: "member_not_in_league" },
        { status: 404 },
      );
    }

    const teamMembership = await prisma.teamMember.findUnique({
      where: {
        teamId_memberId: {
          teamId,
          memberId: body.memberId,
        },
      },
      select: { id: true },
    });

    if (!teamMembership) {
      return NextResponse.json(
        { error: "member_not_on_team" },
        { status: 400 },
      );
    }

    // Check total percentages won't exceed 100%
    const existingPayments = await prisma.teamDriverPayment.findMany({
      where: {
        teamId,
        memberId: { not: body.memberId },
      },
      select: { paymentPercent: true },
    });

    const totalPercent =
      existingPayments.reduce((sum, p) => sum + p.paymentPercent, 0) +
      body.paymentPercent;

    if (totalPercent > 100) {
      return NextResponse.json(
        {
          error: "total_percent_exceeds_100",
          currentTotal: totalPercent,
        },
        { status: 400 },
      );
    }

    // Create or update the payment split
    const payment = await prisma.teamDriverPayment.upsert({
      where: {
        teamId_memberId: {
          teamId,
          memberId: body.memberId,
        },
      },
      create: {
        teamId,
        memberId: body.memberId,
        paymentPercent: body.paymentPercent,
      },
      update: {
        paymentPercent: body.paymentPercent,
      },
    });

    return NextResponse.json(
      {
        id: payment.id,
        memberId: payment.memberId,
        paymentPercent: payment.paymentPercent,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating/updating driver payment:", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/teams/[teamId]/driver-payments/[memberId]
 * Delete a driver payment split configuration
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await context.params;
    const accessToken = request.cookies.get("irh_access_token")?.value;

    if (!accessToken) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Verify user is team captain
    const iracingCustId = getIracingCustIdFromJwt(accessToken);
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        captain: {
          select: { custId: true },
        },
      },
    });

    if (!team) {
      return NextResponse.json({ error: "team_not_found" }, { status: 404 });
    }

    if (team.captain.custId !== iracingCustId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const memberId = url.searchParams.get("memberId");

    if (!memberId) {
      return NextResponse.json({ error: "missing_member_id" }, { status: 400 });
    }

    await prisma.teamDriverPayment.deleteMany({
      where: {
        teamId,
        memberId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting driver payment:", error);
    return NextResponse.json(
      { error: "internal_server_error" },
      { status: 500 },
    );
  }
}
