import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { toPaise } from "@/lib/money";
import { updateGoalSchema } from "@/lib/validations/goal";

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
    const parsed = updateGoalSchema.safeParse(body);
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

    const updateData: any = {};
    if (parsed.data.name !== undefined) {
      updateData.name = parsed.data.name;
    }
    if (parsed.data.targetDate !== undefined) {
      updateData.targetDate = parsed.data.targetDate || null;
    }

    if (parsed.data.targetMinor !== undefined) {
      updateData.targetMinor = parsed.data.targetMinor;
    } else if (parsed.data.target !== undefined) {
      try {
        updateData.targetMinor = toPaise(parsed.data.target);
      } catch (err: any) {
        return NextResponse.json(
          { error: { code: "INVALID_AMOUNT", message: err.message || "Invalid target amount" } },
          { status: 400 }
        );
      }
    }

    if (updateData.targetMinor !== undefined) {
      if (updateData.targetMinor <= 0) {
        return NextResponse.json(
          { error: { code: "INVALID_AMOUNT", message: "Target amount must be greater than 0" } },
          { status: 400 }
        );
      }
      if (updateData.targetMinor >= 1_000_000_000 * 100) {
        return NextResponse.json(
          { error: { code: "AMOUNT_TOO_LARGE", message: "Target amount must be under 1,000,000,000" } },
          { status: 400 }
        );
      }
    }

    const updated = await db.savingsGoal.update({
      where: { id },
      data: updateData,
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
    });
  } catch (err) {
    console.error("PATCH /api/goals/:id error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update savings goal" } },
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

    const existingGoal = await db.savingsGoal.findUnique({
      where: { id },
    });

    if (!existingGoal || existingGoal.userId !== session.userId) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Goal not found" } },
        { status: 404 }
      );
    }

    await db.savingsGoal.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("DELETE /api/goals/:id error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to delete savings goal" } },
      { status: 500 }
    );
  }
}
