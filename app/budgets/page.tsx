"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { Card, Button, Input, ProgressBar } from "@/components/ui";
import { formatMoney, toPaise, toMajorString } from "@/lib/money";

interface CategoryBudgetStat {
  categoryId: string;
  categoryName: string;
  budgetMinor: number | null;
  spentMinor: number;
  remainingMinor: number | null;
  isOver: boolean;
  percentage: number;
}

interface BudgetsData {
  month: string;
  overall: {
    budgetMinor: number | null;
    spentMinor: number;
    remainingMinor: number | null;
    isOver: boolean;
    percentage: number;
  };
  categories: CategoryBudgetStat[];
}

export default function BudgetsPage() {
  const router = useRouter();
  const [data, setData] = useState<BudgetsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");

  // Input states
  const [overallInput, setOverallInput] = useState<string>("");
  const [overallSubmitting, setOverallSubmitting] = useState(false);
  const [overallError, setOverallError] = useState<string | null>(null);
  const [overallSuccess, setOverallSuccess] = useState<string | null>(null);

  // Per-category inputs and submission states: Record<categoryId, string>
  const [categoryInputs, setCategoryInputs] = useState<Record<string, string>>({});
  const [categorySubmitting, setCategorySubmitting] = useState<Record<string, boolean>>({});
  const [categoryErrors, setCategoryErrors] = useState<Record<string, string>>({});
  const [categorySuccess, setCategorySuccess] = useState<Record<string, string>>({});

  const loadBudgets = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/budgets");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || "Failed to load budgets");
      }
      const json: BudgetsData = await res.json();
      setData(json);

      // Populate overall input
      if (json.overall.budgetMinor !== null) {
        setOverallInput(toMajorString(json.overall.budgetMinor));
      } else {
        setOverallInput("");
      }

      // Populate category inputs
      const catInputs: Record<string, string> = {};
      for (const cat of json.categories) {
        if (cat.budgetMinor !== null) {
          catInputs[cat.categoryId] = toMajorString(cat.budgetMinor);
        } else {
          catInputs[cat.categoryId] = "";
        }
      }
      setCategoryInputs(catInputs);

      // Fetch user profile name
      const meRes = await fetch("/api/auth/me");
      if (meRes.ok) {
        const meJson = await meRes.json();
        setUserName(meJson.user.name);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load budgets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBudgets();
  }, []);

  const handleSaveOverall = async (e: React.FormEvent) => {
    e.preventDefault();
    setOverallSubmitting(true);
    setOverallError(null);
    setOverallSuccess(null);

    try {
      let amountMinor: number | null = null;
      if (overallInput.trim() !== "") {
        amountMinor = toPaise(overallInput.trim());
      }

      const res = await fetch("/api/budgets/overall", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountMinor }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error?.message || "Failed to update overall budget");
      }

      setOverallSuccess(amountMinor !== null ? "Overall budget updated!" : "Overall budget cleared!");
      await loadBudgets();
      setTimeout(() => setOverallSuccess(null), 3000);
    } catch (err: any) {
      setOverallError(err.message || "Failed to save overall budget");
    } finally {
      setOverallSubmitting(false);
    }
  };

  const handleClearOverall = async () => {
    setOverallSubmitting(true);
    setOverallError(null);
    setOverallSuccess(null);
    try {
      const res = await fetch("/api/budgets/overall", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountMinor: null }),
      });
      if (!res.ok) {
        const resJson = await res.json();
        throw new Error(resJson.error?.message || "Failed to clear overall budget");
      }
      setOverallInput("");
      setOverallSuccess("Overall budget cleared!");
      await loadBudgets();
      setTimeout(() => setOverallSuccess(null), 3000);
    } catch (err: any) {
      setOverallError(err.message || "Failed to clear overall budget");
    } finally {
      setOverallSubmitting(false);
    }
  };

  const handleSaveCategory = async (categoryId: string) => {
    setCategorySubmitting((prev) => ({ ...prev, [categoryId]: true }));
    setCategoryErrors((prev) => ({ ...prev, [categoryId]: "" }));
    setCategorySuccess((prev) => ({ ...prev, [categoryId]: "" }));

    const val = (categoryInputs[categoryId] || "").trim();
    if (!val) {
      setCategoryErrors((prev) => ({ ...prev, [categoryId]: "Enter an amount" }));
      setCategorySubmitting((prev) => ({ ...prev, [categoryId]: false }));
      return;
    }

    try {
      const amountMinor = toPaise(val);
      const res = await fetch(`/api/budgets/${categoryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountMinor }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error?.message || "Failed to save budget");
      }

      setCategorySuccess((prev) => ({ ...prev, [categoryId]: "Saved!" }));
      await loadBudgets();
      setTimeout(() => {
        setCategorySuccess((prev) => ({ ...prev, [categoryId]: "" }));
      }, 3000);
    } catch (err: any) {
      setCategoryErrors((prev) => ({ ...prev, [categoryId]: err.message || "Failed to save" }));
    } finally {
      setCategorySubmitting((prev) => ({ ...prev, [categoryId]: false }));
    }
  };

  const handleClearCategory = async (categoryId: string) => {
    setCategorySubmitting((prev) => ({ ...prev, [categoryId]: true }));
    setCategoryErrors((prev) => ({ ...prev, [categoryId]: "" }));
    setCategorySuccess((prev) => ({ ...prev, [categoryId]: "" }));

    try {
      const res = await fetch(`/api/budgets/${categoryId}`, {
        method: "DELETE",
      });

      if (!res.ok && res.status !== 404) {
        const resJson = await res.json().catch(() => ({}));
        throw new Error(resJson.error?.message || "Failed to clear budget");
      }

      setCategoryInputs((prev) => ({ ...prev, [categoryId]: "" }));
      setCategorySuccess((prev) => ({ ...prev, [categoryId]: "Cleared!" }));
      await loadBudgets();
      setTimeout(() => {
        setCategorySuccess((prev) => ({ ...prev, [categoryId]: "" }));
      }, 3000);
    } catch (err: any) {
      setCategoryErrors((prev) => ({ ...prev, [categoryId]: err.message || "Failed to clear" }));
    } finally {
      setCategorySubmitting((prev) => ({ ...prev, [categoryId]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar userName={userName} />

      <main className="max-w-[1100px] mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Budget Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Set spending limits for the whole month or by category to monitor and control your expenses.
          </p>
        </div>

        {error && (
          <div className="bg-white border border-red-200 rounded-xl p-6 text-center shadow-xs">
            <p className="text-sm font-semibold text-[#DC2626] mb-1">Something went wrong</p>
            <p className="text-xs text-slate-500 mb-4">{error}</p>
            <Button variant="secondary" size="sm" onClick={loadBudgets}>
              Try again
            </Button>
          </div>
        )}

        {loading && !error && (
          <div className="space-y-6">
            <div className="bg-white h-44 rounded-xl border border-slate-200 animate-pulse" />
            <div className="bg-white h-72 rounded-xl border border-slate-200 animate-pulse" />
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* Overall Monthly Budget Card */}
            <Card title="Overall Monthly Budget" subtitle="Applies to every month across all expenses">
              <div className="space-y-4">
                <form onSubmit={handleSaveOverall} className="flex flex-col sm:flex-row items-start sm:items-end gap-3 max-w-xl">
                  <div className="flex-1 w-full">
                    <Input
                      label="Monthly Limit (₹)"
                      type="text"
                      inputMode="decimal"
                      placeholder="e.g. 50000"
                      value={overallInput}
                      onChange={(e) => setOverallInput(e.target.value)}
                      error={overallError || undefined}
                      helperText="Leave blank or clear to disable overall budget limit"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="submit" variant="primary" disabled={overallSubmitting}>
                      {overallSubmitting ? "Saving..." : "Save"}
                    </Button>
                    {data.overall.budgetMinor !== null && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleClearOverall}
                        disabled={overallSubmitting}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                </form>

                {overallSuccess && (
                  <p className="text-xs font-medium text-[#16A34A]">{overallSuccess}</p>
                )}

                {/* Overall Progress Display */}
                <div className="pt-3 border-t border-slate-100">
                  {data.overall.budgetMinor === null ? (
                    <div className="text-sm text-slate-500">
                      <span className="font-semibold text-slate-700">No budget set.</span> Enter an amount above to track your monthly limit.
                    </div>
                  ) : (
                    <div className="space-y-2 max-w-2xl">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-600">Spent this month:</span>
                          <span className="text-lg font-bold font-mono text-[#0F172A]">
                            {formatMoney(data.overall.spentMinor)}
                          </span>
                          <span className="text-sm text-slate-400">
                            of {formatMoney(data.overall.budgetMinor)}
                          </span>
                        </div>
                        {data.overall.isOver ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-[#DC2626]">
                            Over budget by {formatMoney(data.overall.spentMinor - data.overall.budgetMinor)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-[#16A34A]">
                            {formatMoney(data.overall.remainingMinor || 0)} remaining
                          </span>
                        )}
                      </div>
                      <ProgressBar
                        value={data.overall.spentMinor}
                        max={data.overall.budgetMinor}
                        isOver={data.overall.isOver}
                      />
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* Category Budgets Table */}
            <Card
              title="Category Budgets"
              subtitle="Spending limits for individual expense categories (repeat every month)"
            >
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-left text-sm border-collapse min-w-[650px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-3">Category</th>
                      <th className="py-3 px-3 w-40">Monthly Budget (₹)</th>
                      <th className="py-3 px-3">Spent this month</th>
                      <th className="py-3 px-3 w-44">Progress</th>
                      <th className="py-3 px-3 text-center">Status</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.categories.map((cat) => {
                      const inputVal = categoryInputs[cat.categoryId] ?? "";
                      const isSubmitting = categorySubmitting[cat.categoryId] || false;
                      const catErr = categoryErrors[cat.categoryId];
                      const catSucc = categorySuccess[cat.categoryId];

                      return (
                        <tr key={cat.categoryId} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3.5 px-3 font-medium text-[#0F172A]">
                            {cat.categoryName}
                          </td>

                          <td className="py-3.5 px-3">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="0.00"
                              value={inputVal}
                              onChange={(e) =>
                                setCategoryInputs((prev) => ({
                                  ...prev,
                                  [cat.categoryId]: e.target.value,
                                }))
                              }
                              className={`w-full px-2.5 py-1.5 bg-white border rounded-lg text-sm font-mono text-[#0F172A] focus:outline-none focus:ring-2 ${
                                catErr
                                  ? "border-red-300 focus:ring-red-200"
                                  : "border-slate-300 focus:border-[#0F766E] focus:ring-[#0F766E]/20"
                              }`}
                            />
                            {catErr && <p className="text-[11px] text-[#DC2626] mt-0.5">{catErr}</p>}
                            {catSucc && <p className="text-[11px] text-[#16A34A] mt-0.5">{catSucc}</p>}
                          </td>

                          <td className="py-3.5 px-3 font-mono text-slate-700">
                            {formatMoney(cat.spentMinor)}
                          </td>

                          <td className="py-3.5 px-3">
                            {cat.budgetMinor !== null ? (
                              <div className="space-y-1">
                                <ProgressBar
                                  value={cat.spentMinor}
                                  max={cat.budgetMinor}
                                  isOver={cat.isOver}
                                />
                                <div className="text-[11px] text-slate-500 font-mono flex justify-between">
                                  <span>{cat.percentage}%</span>
                                  <span>{formatMoney(cat.budgetMinor)}</span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">No budget set</span>
                            )}
                          </td>

                          <td className="py-3.5 px-3 text-center">
                            {cat.budgetMinor === null ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                                No budget set
                              </span>
                            ) : cat.isOver ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-[#DC2626]">
                                Over budget
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-[#16A34A]">
                                OK
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-3 text-right">
                            <div className="inline-flex items-center gap-1.5 justify-end">
                              <Button
                                size="sm"
                                variant="primary"
                                disabled={isSubmitting}
                                onClick={() => handleSaveCategory(cat.categoryId)}
                              >
                                {isSubmitting ? "..." : "Save"}
                              </Button>
                              {cat.budgetMinor !== null && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={isSubmitting}
                                  onClick={() => handleClearCategory(cat.categoryId)}
                                >
                                  Clear
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
