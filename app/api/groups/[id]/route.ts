import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { computeGroupNetBalances } from "@/lib/ledger";

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

    const group = await db.group.findUnique({
      where: { id: groupId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        expenses: {
          include: {
            paidBy: { select: { id: true, name: true } },
            shares: {
              include: {
                user: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        },
        settlements: {
          include: {
            fromUser: { select: { id: true, name: true } },
            toUser: { select: { id: true, name: true } },
          },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        },
      },
    });

    if (!group) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Group not found" } },
        { status: 404 }
      );
    }

    const isMember = group.members.some((m) => m.userId === session.userId);
    if (!isMember) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Group not found" } },
        { status: 404 }
      );
    }

    const memberIds = group.members.map((m) => m.userId);
    const netBalances = computeGroupNetBalances(memberIds, group.expenses, group.settlements);
    const userBalanceMinor = netBalances[session.userId] || 0;

    const membersWithBalances = group.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      balanceMinor: netBalances[m.user.id] || 0,
      joinedAt: m.joinedAt,
    }));

    return NextResponse.json({
      group: {
        id: group.id,
        name: group.name,
        createdById: group.createdById,
        createdBy: group.createdBy,
        createdAt: group.createdAt,
      },
      members: membersWithBalances,
      userBalanceMinor,
      expenses: group.expenses,
      settlements: group.settlements,
    });
  } catch (err) {
    console.error("GET /api/groups/:id error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch group details" } },
      { status: 500 }
    );
  }
}
