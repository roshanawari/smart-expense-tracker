import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  isValidYearMonth,
  getCurrentYearMonth,
  getMonthRange,
  getLastNMonths,
  formatMonthFull,
} from "@/lib/date";

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
    const month = monthParam || getCurrentYearMonth();

    if (!isValidYearMonth(month)) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_MONTH",
            message: "Invalid month format. Expected YYYY-MM.",
          },
        },
        { status: 400 }
      );
    }

    // Retrieve user for overall budget
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { monthlyBudgetMinor: true },
    });

    const currentRange = getMonthRange(month);

    // Get transactions for selected month
    const monthTransactions = await prisma.transaction.findMany({
      where: {
        userId: session.userId,
        date: {
          gte: currentRange.start,
          lte: currentRange.end,
        },
      },
      include: {
        category: {
          select: { id: true, name: true, type: true },
        },
      },
    });

    let incomeMinor = 0;
    let expensesMinor = 0;
    const expenseCategoryMap: Record<
      string,
      { categoryId: string; categoryName: string; amountMinor: number }
    > = {};

    for (const tx of monthTransactions) {
      if (tx.type === "INCOME") {
        incomeMinor += tx.amountMinor;
      } else if (tx.type === "EXPENSE") {
        expensesMinor += tx.amountMinor;
        if (!expenseCategoryMap[tx.categoryId]) {
          expenseCategoryMap[tx.categoryId] = {
            categoryId: tx.categoryId,
            categoryName: tx.category.name,
            amountMinor: 0,
          };
        }
        expenseCategoryMap[tx.categoryId].amountMinor += tx.amountMinor;
      }
    }

    const balanceMinor = incomeMinor - expensesMinor;

    const expensesByCategory = Object.values(expenseCategoryMap)
      .map((item) => ({
        ...item,
        percentage:
          expensesMinor > 0
            ? Math.round((item.amountMinor / expensesMinor) * 100)
            : 0,
      }))
      .sort((a, b) => b.amountMinor - a.amountMinor);

    // Budget card calculations
    const monthlyBudgetMinor = user?.monthlyBudgetMinor ?? null;
    const budgetSpentMinor = expensesMinor;
    const budgetRemainingMinor =
      monthlyBudgetMinor !== null
        ? monthlyBudgetMinor - budgetSpentMinor
        : null;
    const isOverBudget =
      monthlyBudgetMinor !== null ? budgetSpentMinor > monthlyBudgetMinor : false;
    const budgetPercentage =
      monthlyBudgetMinor && monthlyBudgetMinor > 0
        ? Math.min(
            100,
            Math.round((budgetSpentMinor / monthlyBudgetMinor) * 100)
          )
        : 0;

    // Last 6 months calculation
    const last6Periods = getLastNMonths(month, 6);
    const earliestStart = last6Periods[0].start;
    const latestEnd = last6Periods[last6Periods.length - 1].end;

    const range6Transactions = await prisma.transaction.findMany({
      where: {
        userId: session.userId,
        date: {
          gte: earliestStart,
          lte: latestEnd,
        },
      },
      select: {
        type: true,
        amountMinor: true,
        date: true,
      },
    });

    const last6Months = last6Periods.map((period) => {
      let pIncome = 0;
      let pExpense = 0;
      for (const tx of range6Transactions) {
        if (tx.date >= period.start && tx.date <= period.end) {
          if (tx.type === "INCOME") pIncome += tx.amountMinor;
          if (tx.type === "EXPENSE") pExpense += tx.amountMinor;
        }
      }
      return {
        month: period.month,
        label: period.label,
        incomeMinor: pIncome,
        expensesMinor: pExpense,
        balanceMinor: pIncome - pExpense,
      };
    });

    return NextResponse.json({
      month,
      monthLabel: formatMonthFull(month),
      totals: {
        incomeMinor,
        expensesMinor,
        balanceMinor,
      },
      budget: {
        monthlyBudgetMinor,
        budgetSpentMinor,
        budgetRemainingMinor,
        budgetPercentage,
        isOverBudget,
      },
      expensesByCategory,
      last6Months,
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to load dashboard data" } },
      { status: 500 }
    );
  }
}
