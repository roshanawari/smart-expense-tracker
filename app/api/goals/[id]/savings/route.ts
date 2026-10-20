import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { toPaise } from "@/lib/money";
import { addSavingsSchema } from "@/lib/validations/goal";

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

    const { id } = await params;

    const existingGoal = await db.savingsGoal.findUnique({
      where: { id },
    });

    if (!existingGoal || existingGoal.userId !== session.userId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Goal not found" } },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = addSavingsSchema.safeParse(body);
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

    let amountMinor: number;
    if (parsed.data.amountMinor !== undefined) {
      amountMinor = parsed.data.amountMinor;
    } else if (parsed.data.amount !== undefined) {
      try {
        amountMinor = toPaise(parsed.data.amount);
      } catch (err: any) {
        return NextResponse.json(
          { error: { code: "INVALID_AMOUNT", message: err.message || "Invalid contribution amount" } },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: { code: "MISSING_AMOUNT", message: "Contribution amount is required" } },
        { status: 400 }
      );
    }

    if (amountMinor <= 0) {
      return NextResponse.json(
        { error: { code: "INVALID_AMOUNT", message: "Contribution amount must be greater than 0" } },
        { status: 400 }
      );
    }

    if (amountMinor >= 1_000_000_000 * 100) {
      return NextResponse.json(
        { error: { code: "AMOUNT_TOO_LARGE", message: "Contribution amount must be under 1,000,000,000" } },
        { status: 400 }
      );
    }

    const updated = await db.savingsGoal.update({
      where: { id },
      data: {
        savedMinor: {
          increment: amountMinor,
        },
      },
    });

    const percentage =
      updated.targetMinor > 0
        ? Math.min(100, Math.round((updated.savedMinor / updated.targetMinor) * 100))
        : 0;
    const isReached = updated.savedMinor >= updated.targetMinor;

    return NextResponse.json({
      goal: {
        ...updated,
        percentage,
        isReached,
      },
      message: "Savings added successfully",
    });
  } catch (err) {
    console.error("POST /api/goals/:id/savings error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to add savings contribution" } },
      { status: 500 }
    );
  }
}
