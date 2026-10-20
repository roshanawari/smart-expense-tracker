import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { simplifyDebts } from "@/lib/simplify";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    const { id: groupId } = await params;

    // Check if user is a member of the group
    const membership = await db.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: session.userId,
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Group not found" } },
        { status: 404 }
      );
    }

    const group = await db.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        expenses: {
          include: {
            shares: { select: { userId: true, shareMinor: true } },
          },
        },
        settlements: true,
      },
    });

    if (!group) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Group not found" } },
        { status: 404 }
      );
    }

    const memberIds = group.members.map((m) => m.userId);
    const userMap = new Map(group.members.map((m) => [m.userId, m.user.name]));

    const result = simplifyDebts(memberIds, group.expenses, group.settlements);

    const simplifiedPaymentsWithNames = result.simplifiedPayments.map((p) => ({
      fromUserId: p.fromUserId,
      fromUserName: userMap.get(p.fromUserId) || "Unknown",
      toUserId: p.toUserId,
      toUserName: userMap.get(p.toUserId) || "Unknown",
      amountMinor: p.amountMinor,
    }));

    return NextResponse.json({
      simplifiedPayments: simplifiedPaymentsWithNames,
      rawDebtCount: result.rawDebtCount,
      simplifiedCount: result.simplifiedCount,
    });
  } catch (err) {
    console.error("GET /api/groups/[id]/simplify error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to simplify debts" } },
      { status: 500 }
    );
  }
}
