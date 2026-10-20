"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Card, Button, ProgressBar } from "@/components/ui";
import { ExpensePieChart, IncomeVsExpenseBarChart } from "@/components/dashboard-charts";
import { formatMoney } from "@/lib/money";
import { getPreviousMonth, getNextMonth, isValidYearMonth, getCurrentYearMonth } from "@/lib/date";

interface DashboardData {
  month: string;
  monthLabel: string;
  totals: {
    incomeMinor: number;
    expensesMinor: number;
    balanceMinor: number;
  };
  budget: {
    monthlyBudgetMinor: number | null;
    budgetSpentMinor: number;
    budgetRemainingMinor: number | null;
    budgetPercentage: number;
    isOverBudget: boolean;
  };
  expensesByCategory: Array<{
    categoryId: string;
    categoryName: string;
    amountMinor: number;
    percentage: number;
  }>;
  last6Months: Array<{
    month: string;
    label: string;
    incomeMinor: number;
    expensesMinor: number;
    balanceMinor: number;
  }>;
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryMonth = searchParams.get("month");

  const [currentMonth, setCurrentMonth] = useState<string>(
    queryMonth && isValidYearMonth(queryMonth) ? queryMonth : getCurrentYearMonth()
  );
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");

  // Sync state if URL query param changes
  useEffect(() => {
    if (queryMonth && isValidYearMonth(queryMonth) && queryMonth !== currentMonth) {
      setCurrentMonth(queryMonth);
    }
  }, [queryMonth]);

  const loadData = async (monthToFetch: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard?month=${monthToFetch}`);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || "Something went wrong");
      }
      const json: DashboardData = await res.json();
      setData(json);

      // Check current user name
      const meRes = await fetch("/api/auth/me");
      if (meRes.ok) {
        const meJson = await meRes.json();
        setUserName(meJson.user.name);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(currentMonth);
  }, [currentMonth]);

  const handlePrevMonth = () => {
    const prev = getPreviousMonth(currentMonth);
    setCurrentMonth(prev);
    router.push(`/dashboard?month=${prev}`);
  };

  const handleNextMonth = () => {
    const next = getNextMonth(currentMonth);
    setCurrentMonth(next);
    router.push(`/dashboard?month=${next}`);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar userName={userName} />

      <main className="max-w-[1100px] mx-auto p-4 sm:p-6 space-y-6">
        {/* Top Header: Month Switcher and Quick Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center bg-white border border-slate-200 rounded-lg p-1 shadow-xs">
              <button
                onClick={handlePrevMonth}
                aria-label="Previous month"
                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
              >
                ◀
              </button>
              <span className="px-3 text-sm font-semibold text-[#0F172A] min-w-[120px] text-center">
                {data?.monthLabel || currentMonth}
              </span>
              <button
                onClick={handleNextMonth}
                aria-label="Next month"
                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
              >
                ▶
              </button>
            </div>
            {currentMonth !== getCurrentYearMonth() && (
              <button
                onClick={() => {
                  const now = getCurrentYearMonth();
                  setCurrentMonth(now);
                  router.push(`/dashboard?month=${now}`);
                }}
                className="text-xs text-[#0F766E] hover:underline font-medium cursor-pointer"
              >
                Reset to this month
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <Link href="/transactions/new?type=INCOME">
              <Button variant="secondary" size="md">
                + Add income
              </Button>
            </Link>
            <Link href="/transactions/new?type=EXPENSE">
              <Button variant="primary" size="md">
                + Add expense
              </Button>
            </Link>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-white border border-red-200 rounded-xl p-6 text-center shadow-xs">
            <p className="text-sm font-semibold text-[#DC2626] mb-1">Something went wrong</p>
            <p className="text-xs text-slate-500 mb-4">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => loadData(currentMonth)}>
              Try again
            </Button>
          </div>
        )}

        {/* Loading State */}
        {loading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white h-28 rounded-xl border border-slate-200 animate-pulse" />
            <div className="bg-white h-28 rounded-xl border border-slate-200 animate-pulse" />
            <div className="bg-white h-28 rounded-xl border border-slate-200 animate-pulse" />
          </div>
        )}

        {/* Overview Totals & Budget */}
        {!loading && !error && data && (
          <>
            {/* 3 Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="border-l-4 border-l-[#16A34A]">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Total Income
                </p>
                <p className="text-2xl font-bold text-[#16A34A] mt-1 font-mono">
                  {formatMoney(data.totals.incomeMinor)}
                </p>
                <p className="text-xs text-slate-400 mt-1">for {data.monthLabel}</p>
              </Card>

              <Card className="border-l-4 border-l-[#DC2626]">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Total Expenses
                </p>
                <p className="text-2xl font-bold text-[#DC2626] mt-1 font-mono">
                  {formatMoney(data.totals.expensesMinor)}
                </p>
                <p className="text-xs text-slate-400 mt-1">for {data.monthLabel}</p>
              </Card>

              <Card className="border-l-4 border-l-[#0F766E]">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Net Balance
                </p>
                <p
                  className={`text-2xl font-bold mt-1 font-mono ${
                    data.totals.balanceMinor >= 0 ? "text-[#0F172A]" : "text-[#DC2626]"
                  }`}
                >
                  {formatMoney(data.totals.balanceMinor)}
                </p>
                <p className="text-xs text-slate-400 mt-1">Income minus expenses</p>
              </Card>
            </div>

            {/* Budget Card */}
            <Card
              title="Overall Monthly Budget"
              action={
                <Link href="/budgets">
                  <Button variant="ghost" size="sm">
                    Manage budgets →
                  </Button>
                </Link>
              }
            >
              {data.budget.monthlyBudgetMinor === null ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50 rounded-lg text-sm">
                  <div className="text-slate-600">
                    <span className="font-medium text-slate-700">No budget set.</span> Set a monthly spending limit to keep your expenses on track.
                  </div>
                  <Link href="/budgets">
                    <Button variant="secondary" size="sm">
                      Set budget
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-600">Spent:</span>
                      <span className="text-lg font-bold font-mono text-[#0F172A]">
                        {formatMoney(data.budget.budgetSpentMinor)}
                      </span>
                      <span className="text-sm text-slate-400">
                        of {formatMoney(data.budget.monthlyBudgetMinor)}
                      </span>
                    </div>
                    {data.budget.isOverBudget ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-[#DC2626]">
                        Over budget by{" "}
                        {formatMoney(
                          data.budget.budgetSpentMinor - data.budget.monthlyBudgetMinor
                        )}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-[#16A34A]">
                        {formatMoney(data.budget.budgetRemainingMinor || 0)} remaining
                      </span>
                    )}
                  </div>
                  <ProgressBar
                    value={data.budget.budgetSpentMinor}
                    max={data.budget.monthlyBudgetMinor}
                    isOver={data.budget.isOverBudget}
                  />
                </div>
              )}
            </Card>

            {/* Charts Section: Pie & Bar */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card
                title="Expenses by Category"
                subtitle={`Spending breakdown for ${data.monthLabel}`}
              >
                <ExpensePieChart data={data.expensesByCategory} />
              </Card>

              <Card
                title="Income vs Expenses (Last 6 Months)"
                subtitle="Monthly comparison trend"
              >
                <IncomeVsExpenseBarChart data={data.last6Months} />
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center text-slate-400 text-sm">
          Loading dashboard...
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
