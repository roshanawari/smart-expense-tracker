"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { formatMoney } from "@/lib/money";

interface Category {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
}

interface TransactionItem {
  id: string;
  type: "INCOME" | "EXPENSE";
  amountMinor: number;
  date: string;
  description: string | null;
  category: {
    id: string;
    name: string;
    type: "INCOME" | "EXPENSE";
  };
}

function TransactionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterMonth, setFilterMonth] = useState(searchParams.get("month") || "");
  const [filterType, setFilterType] = useState(searchParams.get("type") || "");
  const [filterCategoryId, setFilterCategoryId] = useState(searchParams.get("categoryId") || "");

  // Delete modal state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterMonth) params.set("month", filterMonth);
      if (filterType) params.set("type", filterType);
      if (filterCategoryId) params.set("categoryId", filterCategoryId);

      const [txRes, catRes] = await Promise.all([
        fetch(`/api/transactions?${params.toString()}`),
        fetch("/api/categories"),
      ]);

      if (txRes.status === 401) {
        router.push("/login");
        return;
      }

      if (!txRes.ok) {
        throw new Error("Failed to load transactions");
      }

      const txData = await txRes.json();
      setTransactions(txData.transactions || []);

      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(catData.categories || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [filterMonth, filterType, filterCategoryId, router]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleDelete = async () => {
    if (!deletingId) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/transactions/${deletingId}`, {
        method: "DELETE",
      });
      if (res.ok || res.status === 204) {
        setTransactions((prev) => prev.filter((t) => t.id !== deletingId));
        setDeletingId(null);
      } else {
        alert("Failed to delete transaction");
      }
    } catch {
      alert("Something went wrong");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar />

      <main className="max-w-[1100px] mx-auto p-4 sm:p-6 space-y-6">
        {/* Header & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Transactions</h1>
            <p className="text-sm text-slate-500 mt-1">
              Manage your income and expense records
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/statements"
              className="px-3 py-2 bg-teal-50 border border-teal-200 hover:bg-teal-100/70 text-[#0F766E] text-sm font-semibold rounded-lg transition-colors shadow-xs inline-flex items-center gap-1.5"
            >
              <span>📊</span>
              <span>Statement Analyzer</span>
            </Link>
            <a
              href={`/api/transactions/export?format=csv${filterMonth ? `&month=${filterMonth}` : ""}${filterType ? `&type=${filterType}` : ""}${filterCategoryId ? `&categoryId=${filterCategoryId}` : ""}`}
              download
              className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              Export CSV
            </a>
            <a
              href={`/api/transactions/export?format=pdf${filterMonth ? `&month=${filterMonth}` : ""}${filterType ? `&type=${filterType}` : ""}${filterCategoryId ? `&categoryId=${filterCategoryId}` : ""}`}
              download
              className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              Export PDF
            </a>
            <Link
              href="/transactions/new?type=INCOME"
              className="px-3.5 py-2 bg-[#16A34A] hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors shadow-xs"
            >
              + Add income
            </Link>
            <Link
              href="/transactions/new?type=EXPENSE"
              className="px-3.5 py-2 bg-[#DC2626] hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shadow-xs"
            >
              + Add expense
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="filter-month" className="block text-xs font-medium text-slate-600 mb-1">
                Filter by Month
              </label>
              <input
                id="filter-month"
                type="month"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              />
            </div>

            <div>
              <label htmlFor="filter-type" className="block text-xs font-medium text-slate-600 mb-1">
                Filter by Type
              </label>
              <select
                id="filter-type"
                value={filterType}
                onChange={(e) => {
                  setFilterType(e.target.value);
                  setFilterCategoryId("");
                }}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              >
                <option value="">All Types</option>
                <option value="INCOME">Income</option>
                <option value="EXPENSE">Expense</option>
              </select>
            </div>

            <div>
              <label htmlFor="filter-category" className="block text-xs font-medium text-slate-600 mb-1">
                Filter by Category
              </label>
              <select
                id="filter-category"
                value={filterCategoryId}
                onChange={(e) => setFilterCategoryId(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              >
                <option value="">All Categories</option>
                {categories
                  .filter((c) => !filterType || c.type === filterType)
                  .map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} ({cat.type === "INCOME" ? "Income" : "Expense"})
                    </option>
                  ))}
              </select>
            </div>
          </div>
          {(filterMonth || filterType || filterCategoryId) && (
            <div className="mt-3 pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => {
                  setFilterMonth("");
                  setFilterType("");
                  setFilterCategoryId("");
                }}
                className="text-xs text-[#0F766E] hover:underline font-medium"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="p-8 text-center bg-white rounded-xl border border-slate-200 shadow-sm text-slate-500">
            <div className="inline-block animate-spin h-6 w-6 border-2 border-[#0F766E] border-t-transparent rounded-full mb-2"></div>
            <p className="text-sm">Loading transactions...</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-700 shadow-sm space-y-3">
            <p className="font-medium text-sm">Something went wrong: {error}</p>
            <button
              onClick={fetchTransactions}
              className="px-4 py-2 bg-[#0F766E] text-white text-sm font-medium rounded-lg hover:bg-[#0d655e]"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && transactions.length === 0 && (
          <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-sm space-y-4">
            <p className="text-slate-500 font-medium">No transactions yet</p>
            <p className="text-xs text-slate-400">
              Start by adding your first income or expense transaction.
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <Link
                href="/transactions/new?type=INCOME"
                className="px-3.5 py-2 bg-[#16A34A] text-white text-sm font-medium rounded-lg hover:bg-emerald-700"
              >
                + Add income
              </Link>
              <Link
                href="/transactions/new?type=EXPENSE"
                className="px-3.5 py-2 bg-[#DC2626] text-white text-sm font-medium rounded-lg hover:bg-red-700"
              >
                + Add expense
              </Link>
            </div>
          </div>
        )}

        {/* Transactions Table */}
        {!loading && !error && transactions.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Date</th>
                    <th className="px-4 py-3 text-left font-semibold">Type</th>
                    <th className="px-4 py-3 text-left font-semibold">Category</th>
                    <th className="px-4 py-3 text-left font-semibold">Description</th>
                    <th className="px-4 py-3 text-right font-semibold">Amount</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap font-mono text-xs">
                        {tx.date}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            tx.type === "INCOME"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {tx.type === "INCOME" ? "Income" : "Expense"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-800 font-medium whitespace-nowrap">
                        {tx.category.name}
                      </td>
                      <td className="px-4 py-3 text-slate-500 max-w-xs truncate">
                        {tx.description || <span className="text-slate-300 italic">—</span>}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${
                          tx.type === "INCOME" ? "text-[#16A34A]" : "text-[#DC2626]"
                        }`}
                      >
                        {tx.type === "INCOME" ? "+" : "-"}
                        {formatMoney(tx.amountMinor)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                        <Link
                          href={`/transactions/${tx.id}/edit`}
                          className="px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-[#0F766E] border border-slate-200 rounded hover:bg-slate-100 transition-colors inline-block"
                        >
                          Edit
                        </Link>
                        <button
                          onClick={() => setDeletingId(tx.id)}
                          className="px-2.5 py-1 text-xs font-medium text-red-600 hover:text-red-800 border border-red-200 rounded hover:bg-red-50 transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Delete confirmation modal */}
        {deletingId && (
          <div
            id="delete-modal"
            className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          >
            <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
              <h3 className="text-lg font-bold text-slate-900">
                Delete transaction?
              </h3>
              <p className="text-sm text-slate-600">
                Are you sure you want to delete this transaction? This action cannot be undone.
              </p>
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingId(null)}
                  disabled={deleteLoading}
                  className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteLoading}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#DC2626] hover:bg-red-700 rounded-lg disabled:opacity-50"
                >
                  {deleteLoading ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading...</div>}>
      <TransactionsContent />
    </Suspense>
  );
}
