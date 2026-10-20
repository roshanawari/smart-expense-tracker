import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { toPaise } from "@/lib/money";
import { z } from "zod";

const createSettlementSchema = z.object({
  groupId: z.string().nullable().optional(),
  fromUserId: z.string().min(1, "Payer is required"),
  toUserId: z.string().min(1, "Recipient is required"),
  amountMinor: z.number().int().positive().max(100_000_000_000).optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  date: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Invalid date format"),
  note: z.string().max(200).nullable().optional(),
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

    const { searchParams } = new URL(request.url);
    const friendId = searchParams.get("friendId");
    const groupId = searchParams.get("groupId");

    const where: any = {};

    if (groupId) {
      // Must be member of the group
      const membership = await db.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: session.userId } },
      });
      if (!membership) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Group not found" } },
          { status: 404 }
        );
      }
      where.groupId = groupId;
    } else if (friendId) {
      // Must be mutual friends
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
      where.OR = [
        { fromUserId: session.userId, toUserId: friendId },
        { fromUserId: friendId, toUserId: session.userId },
      ];
      // All settlements where session user was either sender or receiver, or in user's groups
      const userGroups = await db.groupMember.findMany({
        where: { userId: session.userId },
        select: { groupId: true },
      });
      const groupIds = userGroups.map((g) => g.groupId);

      where.OR = [
        { fromUserId: session.userId },
        { toUserId: session.userId },
        ...(groupIds.length > 0 ? [{ groupId: { in: groupIds } }] : []),
      ];
    }

    const settlements = await db.settlement.findMany({
      where,
      include: {
        fromUser: { select: { id: true, name: true, email: true } },
        toUser: { select: { id: true, name: true, email: true } },
        group: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ settlements });
  } catch (err) {
    console.error("GET /api/settlements error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch settlements" } },
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
    const parsed = createSettlementSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message || "Invalid input",
          },
        },
        { status: 400 }
      );
    }

    const { groupId, fromUserId, toUserId, date, note } = parsed.data;

    if (fromUserId === toUserId) {
      return NextResponse.json(
        { error: { code: "INVALID_PARTICIPANTS", message: "Payer and recipient cannot be the same" } },
        { status: 400 }
      );
    }

    // Current user must be involved in settlement
    if (session.userId !== fromUserId && session.userId !== toUserId) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "You can only record payments you made or received" } },
        { status: 401 }
      );
    }

    let amountMinor: number;
    if (parsed.data.amountMinor !== undefined) {
      amountMinor = parsed.data.amountMinor;
    } else if (parsed.data.amount !== undefined) {
      try {
        amountMinor = toPaise(parsed.data.amount);
      } catch (err: any) {
        return NextResponse.json(
          { error: { code: "INVALID_AMOUNT", message: err.message || "Invalid settlement amount" } },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: { code: "MISSING_AMOUNT", message: "Amount is required" } },
        { status: 400 }
      );
    }

    if (amountMinor <= 0) {
      return NextResponse.json(
        { error: { code: "INVALID_AMOUNT", message: "Amount must be greater than 0" } },
        { status: 400 }
      );
    }

    if (groupId) {
      // Check group membership for both parties
      const group = await db.group.findUnique({
        where: { id: groupId },
        include: { members: { select: { userId: true } } },
      });

      if (!group) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Group not found" } },
          { status: 404 }
        );
      }

      const memberIds = new Set(group.members.map((m) => m.userId));
      if (!memberIds.has(fromUserId) || !memberIds.has(toUserId)) {
        return NextResponse.json(
          { error: { code: "NOT_GROUP_MEMBER", message: "Both parties must be group members" } },
          { status: 400 }
        );
      }
    } else {
      // Check friendship
      const friendship = await db.friendship.findFirst({
        where: {
          OR: [
            { userAId: fromUserId, userBId: toUserId },
            { userAId: toUserId, userBId: fromUserId },
          ],
        },
      });

      if (!friendship) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Both parties must be friends" } },
          { status: 404 }
        );
      }
    }

    const settlement = await db.settlement.create({
      data: {
        groupId: groupId || null,
        fromUserId,
        toUserId,
        amountMinor,
        date,
        note: note || null,
      },
      include: {
        fromUser: { select: { id: true, name: true } },
        toUser: { select: { id: true, name: true } },
        group: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ settlement }, { status: 201 });
  } catch (err) {
    console.error("POST /api/settlements error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to record payment" } },
      { status: 500 }
    );
  }
}
