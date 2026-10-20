import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { computeGroupNetBalances } from "@/lib/ledger";
import { z } from "zod";

const createGroupSchema = z.object({
  name: z.string().trim().min(1, "Group name is required").max(50, "Group name max 50 chars"),
  memberIds: z.array(z.string()).default([]),
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

    const memberships = await db.groupMember.findMany({
      where: { userId: session.userId },
      include: {
        group: {
          include: {
            members: {
              select: { userId: true },
            },
            expenses: {
              include: {
                shares: { select: { userId: true, shareMinor: true } },
              },
            },
            settlements: true,
          },
        },
      },
      orderBy: { group: { createdAt: "desc" } },
    });

    const groupsWithBalance = memberships.map((m) => {
      const g = m.group;
      const memberIds = g.members.map((mem) => mem.userId);
      const groupBalances = computeGroupNetBalances(memberIds, g.expenses, g.settlements);
      const userBalanceMinor = groupBalances[session.userId] || 0;

      return {
        id: g.id,
        name: g.name,
        createdById: g.createdById,
        memberCount: g.members.length,
        balanceMinor: userBalanceMinor,
        createdAt: g.createdAt,
      };
    });

    return NextResponse.json({ groups: groupsWithBalance });
  } catch (err) {
    console.error("GET /api/groups error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch groups" } },
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
    const parsed = createGroupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message || "Invalid group input",
          },
        },
        { status: 400 }
      );
    }

    const { name, memberIds } = parsed.data;

    // Filter out session user if present in memberIds, then verify all are friends of session user
    const distinctOtherIds = Array.from(new Set(memberIds.filter((id) => id !== session.userId)));

    if (distinctOtherIds.length > 0) {
      const friendships = await db.friendship.findMany({
        where: {
          OR: [
            { userAId: session.userId, userBId: { in: distinctOtherIds } },
            { userBId: session.userId, userAId: { in: distinctOtherIds } },
          ],
        },
      });

      const confirmedFriendIds = new Set<string>();
      for (const f of friendships) {
        confirmedFriendIds.add(f.userAId === session.userId ? f.userBId : f.userAId);
      }

      for (const friendId of distinctOtherIds) {
        if (!confirmedFriendIds.has(friendId)) {
          return NextResponse.json(
            {
              error: {
                code: "NOT_FRIENDS",
                message: "Group members must be friends of the creator",
              },
            },
            { status: 400 }
          );
        }
      }
    }

    // All members to add (including creator)
    const allMembers = [session.userId, ...distinctOtherIds];

    const newGroup = await db.group.create({
      data: {
        name,
        createdById: session.userId,
        members: {
          create: allMembers.map((userId) => ({ userId })),
        },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    return NextResponse.json({ group: newGroup }, { status: 201 });
  } catch (err) {
    console.error("POST /api/groups error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create group" } },
      { status: 500 }
    );
  }
}
