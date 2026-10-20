import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { toPaise } from "@/lib/money";
import { createGoalSchema } from "@/lib/validations/goal";

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    const goals = await db.savingsGoal.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: "desc" },
    });

    const formattedGoals = goals.map((goal) => {
      const percentage =
        goal.targetMinor > 0
          ? Math.min(100, Math.round((goal.savedMinor / goal.targetMinor) * 100))
          : 0;
      const isReached = goal.savedMinor >= goal.targetMinor;
      return {
        ...goal,
        percentage,
        isReached,
      };
    });

    return NextResponse.json({ goals: formattedGoals });
  } catch (err) {
    console.error("GET /api/goals error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch savings goals" } },
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
    const parsed = createGoalSchema.safeParse(body);
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

    let targetMinor: number;
    if (parsed.data.targetMinor !== undefined) {
      targetMinor = parsed.data.targetMinor;
    } else if (parsed.data.target !== undefined) {
      try {
        targetMinor = toPaise(parsed.data.target);
      } catch (err: any) {
        return NextResponse.json(
          { error: { code: "INVALID_AMOUNT", message: err.message || "Invalid target amount" } },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: { code: "MISSING_TARGET", message: "Target amount is required" } },
        { status: 400 }
      );
    }

    if (targetMinor <= 0) {
      return NextResponse.json(
        { error: { code: "INVALID_AMOUNT", message: "Target amount must be greater than 0" } },
        { status: 400 }
      );
    }

    if (targetMinor >= 1_000_000_000 * 100) {
      return NextResponse.json(
        { error: { code: "AMOUNT_TOO_LARGE", message: "Target amount must be under 1,000,000,000" } },
        { status: 400 }
      );
    }

    const goal = await db.savingsGoal.create({
      data: {
        userId: session.userId,
        name: parsed.data.name,
        targetMinor,
        savedMinor: 0,
        targetDate: parsed.data.targetDate || null,
      },
    });

    return NextResponse.json(
      {
        goal: {
          ...goal,
          percentage: 0,
          isReached: false,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/goals error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create savings goal" } },
      { status: 500 }
    );
  }
}
