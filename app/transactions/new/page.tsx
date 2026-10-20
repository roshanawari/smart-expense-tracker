"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { parseMoneyInput } from "@/lib/money";

interface Category {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
}

function TransactionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialType = searchParams.get("type") === "INCOME" ? "INCOME" : "EXPENSE";

  const [type, setType] = useState<"INCOME" | "EXPENSE">(initialType);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Bill scan state (F18)
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<{ name: string; amount: number }[]>([]);

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanError(null);
    if (file.size > 5 * 1024 * 1024) {
      setScanError("Bill image exceeds 5 MB limit. Enter it manually.");
      e.target.value = "";
      return;
    }

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setScanError("Could not read this bill. Enter it manually.");
      e.target.value = "";
      return;
    }

    setScanning(true);
    try {
      const formData = new FormData();
      formData.append("bill", file);

      const res = await fetch("/api/bills/scan", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        setScanError(
          json.error?.message || "Could not read this bill. Enter it manually."
        );
        return;
      }

      if (json.merchant) setDescription(json.merchant);
      if (json.date) setDate(json.date);
      if (json.total) setAmount(json.total);
      if (json.items && json.items.length > 0) {
        setLineItems(json.items);
      }
    } catch {
      setScanError("Could not read this bill. Enter it manually.");
    } finally {
      setScanning(false);
      e.target.value = "";
    }
  };

  useEffect(() => {
    async function loadCategories() {
      try {
        const res = await fetch("/api/categories");
        if (res.ok) {
          const data = await res.json();
          setCategories(data.categories || []);
        }
      } catch (err) {
        console.error("Failed to load categories:", err);
      } finally {
        setLoadingCategories(false);
      }
    }
    loadCategories();
  }, []);

  // Filter categories by selected type
  const availableCategories = categories.filter((c) => c.type === type);

  // Auto-select first category if current categoryId does not match available
  useEffect(() => {
    if (availableCategories.length > 0) {
      const exists = availableCategories.some((c) => c.id === categoryId);
      if (!exists) {
        setCategoryId(availableCategories[0].id);
      }
    } else {
      setCategoryId("");
    }
  }, [type, availableCategories, categoryId]);

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
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          amountMinor: moneyResult.paise,
          date,
          categoryId,
          description: description.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        setServerError(errData?.error?.message || "Failed to create transaction");
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

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar />
      <main className="max-w-[700px] mx-auto p-4 sm:p-6 space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          <div className="border-b border-slate-200 pb-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A]">
                Add {type === "INCOME" ? "Income" : "Expense"}
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Record a new financial transaction
              </p>
            </div>

            <div>
              <label
                htmlFor="bill-upload"
                className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-sm cursor-pointer ${
                  scanning ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                <svg className="w-4 h-4 text-[#0F766E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {scanning ? "Reading bill..." : "Scan bill"}
              </label>
              <input
                id="bill-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={scanning}
                onChange={handleFileScan}
              />
            </div>
          </div>

          {scanError && (
            <div className="p-3.5 mb-6 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center justify-between">
              <span>{scanError}</span>
              <button
                type="button"
                onClick={() => setScanError(null)}
                className="text-red-500 hover:text-red-700 text-xs font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {lineItems.length > 0 && (
            <div className="p-3.5 mb-6 bg-teal-50 border border-teal-200 rounded-lg text-xs space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-[#0F766E]">
                  Receipt Line Items (Reference only)
                </p>
                <button
                  type="button"
                  onClick={() => setLineItems([])}
                  className="text-teal-700 hover:text-teal-900 text-[11px]"
                >
                  Dismiss
                </button>
              </div>
              <ul className="divide-y divide-teal-100 max-h-36 overflow-y-auto">
                {lineItems.map((item, idx) => (
                  <li key={idx} className="py-1 flex justify-between text-slate-700">
                    <span className="truncate pr-2">{item.name}</span>
                    <span className="font-mono font-medium shrink-0">₹{item.amount.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {serverError && (
            <div className="p-3.5 mb-6 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Type selector */}
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

            {/* Amount input */}
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
                  placeholder="0.00"
                  className={`w-full pl-8 pr-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0F766E] ${
                    fieldErrors.amount ? "border-red-500" : "border-slate-300"
                  }`}
                />
              </div>
              {fieldErrors.amount && (
                <p className="text-xs text-red-600 mt-1">{fieldErrors.amount}</p>
              )}
            </div>

            {/* Date input */}
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

            {/* Category select */}
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-slate-700 mb-1">
                Category
              </label>
              {loadingCategories ? (
                <div className="text-xs text-slate-400 py-2">Loading categories...</div>
              ) : (
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
              )}
              {fieldErrors.categoryId && (
                <p className="text-xs text-red-600 mt-1">{fieldErrors.categoryId}</p>
              )}
            </div>

            {/* Description input */}
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
                placeholder="Short note or memo"
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

            {/* Form actions */}
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

export default function NewTransactionPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading form...</div>}>
      <TransactionForm />
    </Suspense>
  );
}
