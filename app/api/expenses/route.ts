import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { toPaise } from "@/lib/money";
import { splitEqual, splitPercent, splitExact } from "@/lib/split";
import { z } from "zod";

const createExpenseSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(200, "Description max 200 chars"),
  totalMinor: z.number().int().positive().max(100_000_000_000).optional(),
  total: z.union([z.string(), z.number()]).optional(),
  date: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Invalid date format (YYYY-MM-DD)"),
  groupId: z.string().nullable().optional(),
  friendId: z.string().nullable().optional(),
  paidById: z.string().min(1, "Paid by user is required"),
  splitMethod: z.enum(["EQUAL", "PERCENT", "EXACT"]),
  participants: z.array(
    z.object({
      userId: z.string(),
      percent: z.number().optional(),
      amountMinor: z.number().int().optional(),
      amount: z.union([z.string(), z.number()]).optional(),
    })
  ).min(1, "At least one participant is required"),
});

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
    if (!body.participants && Array.isArray(body.participantIds)) {
      body.participants = body.participantIds.map((uid: string) => ({ userId: uid }));
    } else if (!body.participants && Array.isArray(body.shares)) {
      body.participants = body.shares.map((s: any) => ({
        userId: s.userId,
        percent: s.percent,
        amountMinor: s.exactMinor ?? s.amountMinor,
        amount: s.amount,
      }));
    }

    const parsed = createExpenseSchema.safeParse(body);
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

    const {
      description,
      date,
      groupId,
      friendId,
      paidById,
      splitMethod,
      participants,
    } = parsed.data;

    let totalMinor: number;
    if (parsed.data.totalMinor !== undefined) {
      totalMinor = parsed.data.totalMinor;
    } else if (parsed.data.total !== undefined) {
      try {
        totalMinor = toPaise(parsed.data.total);
      } catch (err: any) {
        return NextResponse.json(
          { error: { code: "INVALID_AMOUNT", message: err.message || "Invalid total amount" } },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: { code: "MISSING_TOTAL", message: "Total amount is required" } },
        { status: 400 }
      );
    }

    if (totalMinor <= 0) {
      return NextResponse.json(
        { error: { code: "INVALID_AMOUNT", message: "Total amount must be greater than 0" } },
        { status: 400 }
      );
    }

    // Permission and membership validation
    if (groupId) {
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
      if (!memberIds.has(session.userId)) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Group not found" } },
          { status: 404 }
        );
      }

      if (!memberIds.has(paidById)) {
        return NextResponse.json(
          { error: { code: "INVALID_PAYER", message: "Payer must be a member of the group" } },
          { status: 400 }
        );
      }

      for (const p of participants) {
        if (!memberIds.has(p.userId)) {
          return NextResponse.json(
            { error: { code: "INVALID_PARTICIPANT", message: "All participants must be members of the group" } },
            { status: 400 }
          );
        }
      }
    } else if (friendId) {
      // One-on-one split
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

      const allowedUsers = new Set([session.userId, friendId]);
      if (!allowedUsers.has(paidById)) {
        return NextResponse.json(
          { error: { code: "INVALID_PAYER", message: "Payer must be you or your friend" } },
          { status: 400 }
        );
      }

      for (const p of participants) {
        if (!allowedUsers.has(p.userId)) {
          return NextResponse.json(
            { error: { code: "INVALID_PARTICIPANT", message: "Participants must be you or your friend" } },
            { status: 400 }
          );
        }
      }
    } else {
      return NextResponse.json(
        { error: { code: "MISSING_CONTEXT", message: "Either groupId or friendId is required" } },
        { status: 400 }
      );
    }

    // Compute shares based on method
    let computedShares: { userId: string; shareMinor: number }[] = [];

    if (splitMethod === "EQUAL") {
      const uids = participants.map((p) => p.userId);
      computedShares = splitEqual(totalMinor, uids);
    } else if (splitMethod === "PERCENT") {
      const outcome = splitPercent(
        totalMinor,
        participants.map((p) => ({ userId: p.userId, percent: p.percent || 0 }))
      );
      if (!outcome.success) {
        return NextResponse.json(
          {
            error: {
              code: "INVALID_SPLIT",
              message: outcome.error,
              remainingPercent: outcome.remainingPercent,
            },
          },
          { status: 400 }
        );
      }
      computedShares = outcome.shares;
    } else if (splitMethod === "EXACT") {
      const parsedExact = participants.map((p) => {
        let amtMinor = p.amountMinor;
        if (amtMinor === undefined && p.amount !== undefined) {
          try {
            amtMinor = toPaise(p.amount);
          } catch {
            amtMinor = 0;
          }
        }
        return { userId: p.userId, amountMinor: amtMinor || 0 };
      });

      const outcome = splitExact(totalMinor, parsedExact);
      if (!outcome.success) {
        return NextResponse.json(
          {
            error: {
              code: "INVALID_SPLIT",
              message: outcome.error,
              remainingMinor: outcome.remainingMinor,
            },
          },
          { status: 400 }
        );
      }
      computedShares = outcome.shares;
    }

    // Persist SharedExpense and ExpenseShare in transaction
    const createdExpense = await db.$transaction(async (tx) => {
      const exp = await tx.sharedExpense.create({
        data: {
          groupId: groupId || null,
          paidById,
          totalMinor,
          description,
          date,
          splitMethod,
          createdById: session.userId,
        },
      });

      await tx.expenseShare.createMany({
        data: computedShares.map((s) => ({
          expenseId: exp.id,
          userId: s.userId,
          shareMinor: s.shareMinor,
        })),
      });

      return tx.sharedExpense.findUnique({
        where: { id: exp.id },
        include: {
          paidBy: { select: { id: true, name: true } },
          shares: {
            include: { user: { select: { id: true, name: true } } },
          },
        },
      });
    });

    return NextResponse.json({ expense: createdExpense }, { status: 201 });
  } catch (err) {
    console.error("POST /api/expenses error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create shared expense" } },
      { status: 500 }
    );
  }
}
