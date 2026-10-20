import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { computePairwiseBalance } from "@/lib/ledger";

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

    const { id: friendId } = await params;

    const friendship = await db.friendship.findFirst({
      where: {
        OR: [
          { userAId: session.userId, userBId: friendId },
          { userAId: friendId, userBId: session.userId },
        ],
      },
    });

    if (!friendship) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Friend not found" } },
        { status: 404 }
      );
    }

    const friend = await db.user.findUnique({
      where: { id: friendId },
      select: { id: true, name: true, email: true },
    });

    if (!friend) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Friend not found" } },
        { status: 404 }
      );
    }

    // Query all shared expenses involving both users
    const allExpenses = await db.sharedExpense.findMany({
      where: {
        AND: [
          {
            OR: [
              { paidById: session.userId },
              { shares: { some: { userId: session.userId } } },
            ],
          },
          {
            OR: [
              { paidById: friendId },
              { shares: { some: { userId: friendId } } },
            ],
          },
        ],
      },
      include: {
        paidBy: { select: { id: true, name: true } },
        shares: {
          include: {
            user: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });

    // Query settlements between these two users
    const allSettlements = await db.settlement.findMany({
      where: {
        OR: [
          { fromUserId: session.userId, toUserId: friendId },
          { fromUserId: friendId, toUserId: session.userId },
        ],
      },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
        group: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });

    const balanceMinor = computePairwiseBalance(
      session.userId,
      friendId,
      allExpenses,
      allSettlements
    );

    return NextResponse.json({
      friend,
      balanceMinor,
      expenses: allExpenses,
      settlements: allSettlements,
    });
  } catch (err) {
    console.error("GET /api/friends/:id error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch friend details" } },
      { status: 500 }
    );
  }
}
