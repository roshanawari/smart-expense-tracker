import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { z } from "zod";

const addMemberSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});

export async function POST(
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
        members: { select: { userId: true } },
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

    const body = await request.json();
    const parsed = addMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message || "Invalid member data",
          },
        },
        { status: 400 }
      );
    }

    const targetUserId = parsed.data.userId;

    // Check if target user is already in group
    const alreadyMember = group.members.some((m) => m.userId === targetUserId);
    if (alreadyMember) {
      return NextResponse.json(
        { error: { code: "ALREADY_MEMBER", message: "User is already a member of this group" } },
        { status: 400 }
      );
    }

    // Verify target user is a friend of the session user
    const friendship = await db.friendship.findFirst({
      where: {
        OR: [
          { userAId: session.userId, userBId: targetUserId },
          { userAId: targetUserId, userBId: session.userId },
        ],
      },
    });

    if (!friendship) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FRIENDS",
            message: "You can only add your friends to the group",
          },
        },
        { status: 400 }
      );
    }

    const newMember = await db.groupMember.create({
      data: {
        groupId,
        userId: targetUserId,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json(
      { member: newMember, message: "Member added successfully" },
      { status: 200 }
    );
  } catch (err) {
    console.error("POST /api/groups/:id/members error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to add group member" } },
      { status: 500 }
    );
  }
}
