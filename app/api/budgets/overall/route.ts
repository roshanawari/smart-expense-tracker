import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { toPaise } from "@/lib/money";

export async function PUT(request: NextRequest) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    let amountMinor: number | null = null;

    if (body.amountMinor !== undefined) {
      amountMinor = body.amountMinor;
    } else if (body.amount !== undefined && body.amount !== null && body.amount !== "") {
      try {
        amountMinor = toPaise(body.amount);
      } catch (err: any) {
        return NextResponse.json(
          { error: { code: "INVALID_AMOUNT", message: err.message || "Invalid amount format" } },
          { status: 400 }
        );
      }
    }

    if (amountMinor !== null) {
      if (amountMinor <= 0) {
        return NextResponse.json(
          { error: { code: "INVALID_AMOUNT", message: "Budget amount must be greater than 0" } },
          { status: 400 }
        );
      }
      if (amountMinor >= 1_000_000_000 * 100) {
        return NextResponse.json(
          { error: { code: "AMOUNT_TOO_LARGE", message: "Budget amount must be under 1,000,000,000" } },
          { status: 400 }
        );
      }
    }

    const updatedUser = await db.user.update({
      where: { id: session.userId },
      data: { monthlyBudgetMinor: amountMinor },
      select: { id: true, monthlyBudgetMinor: true },
    });

    return NextResponse.json({
      user: updatedUser,
      message: amountMinor !== null ? "Overall budget updated" : "Overall budget cleared",
    });
  } catch (err) {
    console.error("PUT /api/budgets/overall error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update overall budget" } },
      { status: 500 }
    );
  }
}
