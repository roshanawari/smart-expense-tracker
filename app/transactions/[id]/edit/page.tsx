"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { parseMoneyInput, toRupeesString } from "@/lib/money";

interface Category {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
}

interface TransactionData {
  id: string;
  type: "INCOME" | "EXPENSE";
  amountMinor: number;
  date: string;
  categoryId: string;
  description: string | null;
}

export default function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [type, setType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        // Load categories and transaction in parallel
        const [catRes, txRes] = await Promise.all([
          fetch("/api/categories"),
          fetch(`/api/transactions/${id}`),
        ]);

        if (catRes.ok) {
          const catData = await catRes.json();
          setCategories(catData.categories || []);
        }

        if (txRes.status === 404 || txRes.status === 401) {
          setNotFound(true);
          return;
        }

        if (txRes.ok) {
          const txData = await txRes.json();
          const tx: TransactionData = txData.transaction;
          setType(tx.type);
          setAmount(toRupeesString(tx.amountMinor));
          setDate(tx.date);
          setCategoryId(tx.categoryId);
          setDescription(tx.description || "");
        } else {
          setServerError("Failed to load transaction");
        }
      } catch (err) {
        console.error("Failed to load edit data:", err);
        setServerError("Failed to load transaction");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  const availableCategories = categories.filter((c) => c.type === type);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    const errors: Record<string, string> = {};

    const moneyResult = parseMoneyInput(amount);
    if (!moneyResult.success) {
      errors.amount = moneyResult.error;
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.date = "A valid calendar date (YYYY-MM-DD) is required";
    }

    if (!categoryId) {
      errors.categoryId = "Category is required";
    }

    if (description && description.length > 200) {
      errors.description = "Description must be at most 200 characters";
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    if (!moneyResult.success) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          amountMinor: moneyResult.paise,
          date,
          categoryId,
          description: description.trim() || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        setServerError(errData?.error?.message || "Failed to update transaction");
        return;
      }

      router.push("/transactions");
      router.refresh();
    } catch {
      setServerError("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <Navbar />
        <main className="max-w-[700px] mx-auto p-8 text-center text-slate-500">
          Loading transaction...
        </main>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <Navbar />
        <main className="max-w-[700px] mx-auto p-12 text-center space-y-4">
          <h1 className="text-2xl font-bold text-slate-800">404 - Not Found</h1>
          <p className="text-sm text-slate-600">
            This transaction does not exist or you do not have permission to view it.
          </p>
          <Link
            href="/transactions"
            className="inline-block mt-4 px-4 py-2 bg-[#0F766E] text-white text-sm font-medium rounded-lg hover:bg-[#0d655e]"
          >
            Back to Transactions
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar />
      <main className="max-w-[700px] mx-auto p-4 sm:p-6 space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          <div className="border-b border-slate-200 pb-4 mb-6">
            <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A]">
              Edit Transaction
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Modify transaction details
            </p>
          </div>

          {serverError && (
            <div className="p-3.5 mb-6 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setType("EXPENSE")}
                  className={`py-2 px-4 rounded-lg text-sm font-medium border transition-colors ${
                    type === "EXPENSE"
                      ? "bg-red-50 border-red-500 text-red-700 font-semibold"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setType("INCOME")}
                  className={`py-2 px-4 rounded-lg text-sm font-medium border transition-colors ${
                    type === "INCOME"
                      ? "bg-green-50 border-green-500 text-green-700 font-semibold"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  Income
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-slate-700 mb-1">
                Amount (₹)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-sm">
                  ₹
                </span>
                <input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    if (fieldErrors.amount) setFieldErrors((prev) => ({ ...prev, amount: "" }));
                  }}
                  className={`w-full pl-8 pr-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E] ${
                    fieldErrors.amount ? "border-red-500" : "border-slate-300"
                  }`}
                />
              </div>
              {fieldErrors.amount && (
                <p className="text-xs text-red-600 mt-1">{fieldErrors.amount}</p>
              )}
            </div>

            <div>
              <label htmlFor="date" className="block text-sm font-medium text-slate-700 mb-1">
                Date
              </label>
              <input
                id="date"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  if (fieldErrors.date) setFieldErrors((prev) => ({ ...prev, date: "" }));
                }}
                className={`w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E] ${
                  fieldErrors.date ? "border-red-500" : "border-slate-300"
                }`}
              />
              {fieldErrors.date && (
                <p className="text-xs text-red-600 mt-1">{fieldErrors.date}</p>
              )}
            </div>

            <div>
              <label htmlFor="category" className="block text-sm font-medium text-slate-700 mb-1">
                Category
              </label>
              <select
                id="category"
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  if (fieldErrors.categoryId) setFieldErrors((prev) => ({ ...prev, categoryId: "" }));
                }}
                className={`w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E] ${
                  fieldErrors.categoryId ? "border-red-500" : "border-slate-300"
                }`}
              >
                {availableCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
              {fieldErrors.categoryId && (
                <p className="text-xs text-red-600 mt-1">{fieldErrors.categoryId}</p>
              )}
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">
                Description (optional)
              </label>
              <input
                id="description"
                type="text"
                maxLength={200}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (fieldErrors.description) setFieldErrors((prev) => ({ ...prev, description: "" }));
                }}
                className={`w-full px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E] ${
                  fieldErrors.description ? "border-red-500" : "border-slate-300"
                }`}
              />
              <div className="flex justify-between items-center mt-1">
                {fieldErrors.description ? (
                  <p className="text-xs text-red-600">{fieldErrors.description}</p>
                ) : <span />}
                <span className="text-xs text-slate-400">
                  {description.length}/200
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200">
              <Link
                href="/transactions"
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-sm font-medium text-white bg-[#0F766E] hover:bg-[#0d655e] rounded-lg transition-colors disabled:opacity-50"
              >
                {submitting ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
