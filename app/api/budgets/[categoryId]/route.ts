import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { toPaise } from "@/lib/money";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    const { categoryId } = await params;

    // Check category exists and is an expense category
    const category = await db.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      return NextResponse.json(
        { error: { code: "CATEGORY_NOT_FOUND", message: "Category not found" } },
        { status: 404 }
      );
    }

    if (category.type !== "EXPENSE") {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_CATEGORY_TYPE",
            message: "Budgets can only be set for expense categories",
          },
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    let amountMinor: number;

    if (body.amountMinor !== undefined) {
      amountMinor = body.amountMinor;
    } else if (body.amount !== undefined) {
      try {
        amountMinor = toPaise(body.amount);
      } catch (err: any) {
        return NextResponse.json(
          { error: { code: "INVALID_AMOUNT", message: err.message || "Invalid amount format" } },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: { code: "MISSING_AMOUNT", message: "Budget amount is required" } },
        { status: 400 }
      );
    }

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

    const budget = await db.budget.upsert({
      where: {
        userId_categoryId: {
          userId: session.userId,
          categoryId,
        },
      },
      create: {
        userId: session.userId,
        categoryId,
        amountMinor,
      },
      update: {
        amountMinor,
      },
      include: {
        category: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ budget }, { status: 200 });
  } catch (err) {
    console.error("PUT /api/budgets/:categoryId error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update category budget" } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  try {
    const session = await getSessionUser(request);
    if (!session) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    const { categoryId } = await params;

    const existingBudget = await db.budget.findUnique({
      where: {
        userId_categoryId: {
          userId: session.userId,
          categoryId,
        },
      },
    });

    if (!existingBudget) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Budget not found for this category" } },
        { status: 404 }
      );
    }

    await db.budget.delete({
      where: { id: existingBudget.id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("DELETE /api/budgets/:categoryId error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to delete category budget" } },
      { status: 500 }
    );
  }
}
