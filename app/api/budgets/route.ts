import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getCurrentYearMonth, getMonthRange, isValidYearMonth } from "@/lib/date";

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
    const monthParam = searchParams.get("month");
    const month = monthParam && isValidYearMonth(monthParam) ? monthParam : getCurrentYearMonth();
    const range = getMonthRange(month);

    const [user, expenseCategories, userBudgets, monthExpenses] = await Promise.all([
      db.user.findUnique({
        where: { id: session.userId },
        select: { monthlyBudgetMinor: true },
      }),
      db.category.findMany({
        where: { type: "EXPENSE" },
        orderBy: { name: "asc" },
      }),
      db.budget.findMany({
        where: { userId: session.userId },
      }),
      db.transaction.findMany({
        where: {
          userId: session.userId,
          type: "EXPENSE",
          date: { gte: range.start, lte: range.end },
        },
        select: { categoryId: true, amountMinor: true },
      }),
    ]);

    // Sum spend per category and overall
    let totalSpentMinor = 0;
    const spendByCat: Record<string, number> = {};
    for (const tx of monthExpenses) {
      totalSpentMinor += tx.amountMinor;
      spendByCat[tx.categoryId] = (spendByCat[tx.categoryId] || 0) + tx.amountMinor;
    }

    // Overall budget stats
    const overallBudget = user?.monthlyBudgetMinor ?? null;
    const overallRemaining = overallBudget !== null ? overallBudget - totalSpentMinor : null;
    const overallIsOver = overallBudget !== null ? totalSpentMinor > overallBudget : false;
    const overallPercentage =
      overallBudget && overallBudget > 0
        ? Math.min(100, Math.round((totalSpentMinor / overallBudget) * 100))
        : 0;

    // Per-category budget stats
    const categoryStats = expenseCategories.map((cat) => {
      const budgetRow = userBudgets.find((b) => b.categoryId === cat.id);
      const budgetMinor = budgetRow?.amountMinor ?? null;
      const spentMinor = spendByCat[cat.id] || 0;
      const remainingMinor = budgetMinor !== null ? budgetMinor - spentMinor : null;
      const isOver = budgetMinor !== null ? spentMinor > budgetMinor : false;
      const percentage =
        budgetMinor && budgetMinor > 0
          ? Math.min(100, Math.round((spentMinor / budgetMinor) * 100))
          : 0;

      return {
        categoryId: cat.id,
        categoryName: cat.name,
        budgetMinor,
        spentMinor,
        remainingMinor,
        isOver,
        percentage,
      };
    });

    return NextResponse.json({
      month,
      overall: {
        budgetMinor: overallBudget,
        spentMinor: totalSpentMinor,
        remainingMinor: overallRemaining,
        isOver: overallIsOver,
        percentage: overallPercentage,
      },
      categories: categoryStats,
    });
  } catch (err) {
    console.error("GET /api/budgets error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch budgets" } },
      { status: 500 }
    );
  }
}
