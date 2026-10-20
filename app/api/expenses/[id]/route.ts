import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { toPaise } from "@/lib/money";
import { splitEqual, splitPercent, splitExact } from "@/lib/split";

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

    const { id } = await params;

    const expense = await db.sharedExpense.findUnique({
      where: { id },
      include: {
        paidBy: { select: { id: true, name: true, email: true } },
        group: {
          include: {
            members: { select: { userId: true } },
          },
        },
        shares: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    if (!expense) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Expense not found" } },
        { status: 404 }
      );
    }

    // Authorization: member of group or participant in one-on-one
    if (expense.groupId) {
      const isMember = expense.group?.members.some((m) => m.userId === session.userId);
      if (!isMember) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Expense not found" } },
          { status: 404 }
        );
      }
    } else {
      const isInvolved =
        expense.paidById === session.userId ||
        expense.createdById === session.userId ||
        expense.shares.some((s) => s.userId === session.userId);
      if (!isInvolved) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Expense not found" } },
          { status: 404 }
        );
      }
    }

    return NextResponse.json({ expense });
  } catch (err) {
    console.error("GET /api/expenses/:id error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch expense" } },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

    const { id } = await params;

    const existingExpense = await db.sharedExpense.findUnique({
      where: { id },
    });

    if (!existingExpense) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Expense not found" } },
        { status: 404 }
      );
    }

    // Only creator can edit
    if (existingExpense.createdById !== session.userId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Expense not found" } },
        { status: 404 }
      );
    }

    const body = await request.json();
    const description = body.description || existingExpense.description;
    const date = body.date || existingExpense.date;
    const paidById = body.paidById || existingExpense.paidById;
    const splitMethod = body.splitMethod || existingExpense.splitMethod;

    let totalMinor = existingExpense.totalMinor;
    if (body.totalMinor !== undefined) {
      totalMinor = body.totalMinor;
    } else if (body.total !== undefined) {
      try {
        totalMinor = toPaise(body.total);
      } catch (err: any) {
        return NextResponse.json(
          { error: { code: "INVALID_AMOUNT", message: err.message || "Invalid total" } },
          { status: 400 }
        );
      }
    }

    const participants = body.participants;

    if (participants && Array.isArray(participants) && participants.length > 0) {
      let computedShares: { userId: string; shareMinor: number }[] = [];

      if (splitMethod === "EQUAL") {
        computedShares = splitEqual(totalMinor, participants.map((p: any) => p.userId));
      } else if (splitMethod === "PERCENT") {
        const outcome = splitPercent(
          totalMinor,
          participants.map((p: any) => ({ userId: p.userId, percent: p.percent || 0 }))
        );
        if (!outcome.success) {
          return NextResponse.json(
            { error: { code: "SPLIT_MISMATCH", message: outcome.error, remainingPercent: outcome.remainingPercent } },
            { status: 400 }
          );
        }
        computedShares = outcome.shares;
      } else if (splitMethod === "EXACT") {
        const parsedExact = participants.map((p: any) => {
          let amt = p.amountMinor;
          if (amt === undefined && p.amount !== undefined) {
            amt = toPaise(p.amount);
          }
          return { userId: p.userId, amountMinor: amt || 0 };
        });
        const outcome = splitExact(totalMinor, parsedExact);
        if (!outcome.success) {
          return NextResponse.json(
            { error: { code: "SPLIT_MISMATCH", message: outcome.error, remainingMinor: outcome.remainingMinor } },
            { status: 400 }
          );
        }
        computedShares = outcome.shares;
      }

      await db.$transaction(async (tx) => {
        await tx.expenseShare.deleteMany({ where: { expenseId: id } });
        await tx.expenseShare.createMany({
          data: computedShares.map((s) => ({
            expenseId: id,
            userId: s.userId,
            shareMinor: s.shareMinor,
          })),
        });
        await tx.sharedExpense.update({
          where: { id },
          data: {
            description,
            date,
            paidById,
            splitMethod,
            totalMinor,
          },
        });
      });
    } else {
      await db.sharedExpense.update({
        where: { id },
        data: { description, date, paidById },
      });
    }

    const updated = await db.sharedExpense.findUnique({
      where: { id },
      include: {
        paidBy: { select: { id: true, name: true } },
        shares: { include: { user: { select: { id: true, name: true } } } },
      },
    });

    return NextResponse.json({ expense: updated });
  } catch (err) {
    console.error("PATCH /api/expenses/:id error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update expense" } },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    const { id } = await params;

    const existingExpense = await db.sharedExpense.findUnique({
      where: { id },
    });

    if (!existingExpense) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Expense not found" } },
        { status: 404 }
      );
    }

    // Only creator can delete
    if (existingExpense.createdById !== session.userId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Expense not found" } },
        { status: 404 }
      );
    }

    await db.sharedExpense.delete({ where: { id } });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("DELETE /api/expenses/:id error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to delete expense" } },
      { status: 500 }
    );
  }
}
