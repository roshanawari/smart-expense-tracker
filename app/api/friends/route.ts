import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { computePairwiseBalance } from "@/lib/ledger";
import { z } from "zod";

const addFriendSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address"),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    const friendships = await db.friendship.findMany({
      where: {
        OR: [{ userAId: session.userId }, { userBId: session.userId }],
      },
      include: {
        userA: { select: { id: true, name: true, email: true } },
        userB: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const friendUsers = friendships.map((f) =>
      f.userAId === session.userId ? f.userB : f.userA
    );

    if (friendUsers.length === 0) {
      return NextResponse.json({ friends: [] });
    }

    const friendIds = friendUsers.map((u) => u.id);

    // Fetch shared expenses involving session user
    const expenses = await db.sharedExpense.findMany({
      where: {
        OR: [
          { paidById: session.userId },
          { shares: { some: { userId: session.userId } } },
        ],
      },
      include: {
        shares: {
          select: { userId: true, shareMinor: true },
        },
      },
    });

    // Fetch settlements involving session user
    const settlements = await db.settlement.findMany({
      where: {
        OR: [
          { fromUserId: session.userId, toUserId: { in: friendIds } },
          { fromUserId: { in: friendIds }, toUserId: session.userId },
        ],
      },
    });

    const friendsWithBalances = friendUsers.map((friend) => {
      const balanceMinor = computePairwiseBalance(
        session.userId,
        friend.id,
        expenses,
        settlements
      );
      return {
        id: friend.id,
        name: friend.name,
        email: friend.email,
        balanceMinor,
      };
    });

    return NextResponse.json({ friends: friendsWithBalances });
  } catch (err) {
    console.error("GET /api/friends error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch friends" } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const parsed = addFriendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message || "Invalid email",
          },
        },
        { status: 400 }
      );
    }

    const targetEmail = parsed.data.email.toLowerCase();

    if (targetEmail === session.email.toLowerCase()) {
      return NextResponse.json(
        {
          error: {
            code: "CANNOT_FRIEND_SELF",
            message: "You cannot add yourself as a friend",
          },
        },
        { status: 400 }
      );
    }

    const targetUser = await db.user.findUnique({
      where: { email: targetEmail },
      select: { id: true, name: true, email: true },
    });

    if (!targetUser) {
      return NextResponse.json(
        {
          error: {
            code: "USER_NOT_FOUND",
            message: "No user with that email",
          },
        },
        { status: 404 }
      );
    }

    const existingFriendship = await db.friendship.findFirst({
      where: {
        OR: [
          { userAId: session.userId, userBId: targetUser.id },
          { userAId: targetUser.id, userBId: session.userId },
        ],
      },
    });

    if (existingFriendship) {
      return NextResponse.json(
        {
          friend: targetUser,
          balanceMinor: 0,
          message: "Already friends",
        },
        { status: 200 }
      );
    }

    await db.friendship.create({
      data: {
        userAId: session.userId,
        userBId: targetUser.id,
      },
    });

    return NextResponse.json(
      {
        friend: targetUser,
        balanceMinor: 0,
        message: "Friend added successfully",
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/friends error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to add friend" } },
      { status: 500 }
    );
  }
}
