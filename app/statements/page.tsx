"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { Card, Button } from "@/components/ui";
import { formatMoney } from "@/lib/money";

interface Category {
  id: string;
  name: string;
  type: "INCOME" | "EXPENSE";
}

interface StatementTransaction {
  tempId: string;
  date: string;
  description: string;
  type: "INCOME" | "EXPENSE";
  amount: string;
  amountMinor: number;
  categoryId: string;
  categoryName: string;
  selected?: boolean;
}

interface StatementSummary {
  totalIncomeMinor: number;
  totalIncome: string;
  totalExpenseMinor: number;
  totalExpense: string;
  netSavingsMinor: number;
  netSavings: string;
  transactionCount: number;
}

export default function BankStatementsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File & Upload state
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Results state
  const [bankName, setBankName] = useState<string>("");
  const [statementPeriod, setStatementPeriod] = useState<string>("");
  const [summary, setSummary] = useState<StatementSummary | null>(null);
  const [transactions, setTransactions] = useState<StatementTransaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "INCOME" | "EXPENSE">("ALL");

  // Import state
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setAnalyzeError(null);
      setImportSuccess(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
      setAnalyzeError(null);
      setImportSuccess(null);
    }
  };

  const handleAnalyze = async () => {
    if (!file) {
      setAnalyzeError("Please select a bank statement file to analyze.");
      return;
    }

    setAnalyzing(true);
    setAnalyzeError(null);
    setImportSuccess(null);
    setImportError(null);

    try {
      const formData = new FormData();
      formData.append("statement", file);

      const res = await fetch("/api/statements/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error?.message || "Failed to analyze bank statement.");
      }

      setBankName(data.bankName || "Bank Statement");
      setStatementPeriod(data.statementPeriod || "");
      setSummary(data.summary || null);
      setCategories(data.categories || []);

      // Default all transactions to selected
      const initialTransactions: StatementTransaction[] = (data.transactions || []).map(
        (t: StatementTransaction) => ({
          ...t,
          selected: true,
        })
      );
      setTransactions(initialTransactions);
    } catch (err: any) {
      setAnalyzeError(err?.message || "Could not analyze the statement. Please check the file.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleLoadSampleStatement = () => {
    const sampleCsv = `Date,Description,Debit,Credit,Balance
2026-10-01,UPI Swiggy Foods,450.00,,45500.00
2026-10-03,Monthly Salary Credit,,65000.00,110500.00
2026-10-05,Uber Ride Airport,380.00,,110120.00
2026-10-10,Amazon Online Shopping,1499.00,,108621.00
2026-10-12,Electricity Bill MSEB,2150.00,,106471.00
2026-10-15,Dividend Payout Mutual Funds,,1250.00,107721.00
2026-10-18,Grocery Supermarket,890.00,,106831.00
2026-10-22,Mobile Recharge Jio,349.00,,106482.00
`;
    const blob = new Blob([sampleCsv], { type: "text/csv" });
    const sampleFile = new File([blob], "sample_october_statement.csv", { type: "text/csv" });
    setFile(sampleFile);
    setAnalyzeError(null);
    setImportSuccess(null);
  };

  const toggleSelectAll = () => {
    const allSelected = visibleTransactions.every((t) => t.selected);
    const visibleIds = new Set(visibleTransactions.map((t) => t.tempId));
    setTransactions((prev) =>
      prev.map((t) =>
        visibleIds.has(t.tempId) ? { ...t, selected: !allSelected } : t
      )
    );
  };

  const toggleRowSelect = (tempId: string) => {
    setTransactions((prev) =>
      prev.map((t) => (t.tempId === tempId ? { ...t, selected: !t.selected } : t))
    );
  };

  const handleFieldChange = (
    tempId: string,
    field: keyof StatementTransaction,
    value: any
  ) => {
    setTransactions((prev) =>
      prev.map((t) => {
        if (t.tempId !== tempId) return t;

        const updated = { ...t, [field]: value };

        if (field === "amount") {
          const num = parseFloat(value) || 0;
          updated.amountMinor = Math.round(num * 100);
        }

        if (field === "type") {
          // Auto adjust category to first category matching new type
          const matchingCat = categories.find((c) => c.type === value);
          if (matchingCat) {
            updated.categoryId = matchingCat.id;
            updated.categoryName = matchingCat.name;
          }
        }

        if (field === "categoryId") {
          const cat = categories.find((c) => c.id === value);
          if (cat) {
            updated.categoryName = cat.name;
          }
        }

        return updated;
      })
    );
  };

  const handleDeleteRow = (tempId: string) => {
    setTransactions((prev) => prev.filter((t) => t.tempId !== tempId));
  };

  // Filter transactions
  const visibleTransactions = transactions.filter((t) => {
    if (typeFilter !== "ALL" && t.type !== typeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        t.description.toLowerCase().includes(q) ||
        t.categoryName.toLowerCase().includes(q) ||
        t.date.includes(q)
      );
    }
    return true;
  });

  const selectedTransactions = transactions.filter((t) => t.selected);

  const handleImportSelected = async () => {
    if (selectedTransactions.length === 0) {
      setImportError("Please select at least one transaction to add.");
      return;
    }

    setImporting(true);
    setImportError(null);
    setImportSuccess(null);

    try {
      const payload = {
        transactions: selectedTransactions.map((t) => ({
          date: t.date,
          description: t.description,
          type: t.type,
          amountMinor: t.amountMinor,
          categoryId: t.categoryId,
        })),
      };

      const res = await fetch("/api/statements/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error?.message || "Failed to import transactions.");
      }

      setImportSuccess(
        `Successfully added ${selectedTransactions.length} transaction${
          selectedTransactions.length === 1 ? "" : "s"
        } directly into your transactions!`
      );

      // Remove imported transactions from the current list
      const importedIds = new Set(selectedTransactions.map((t) => t.tempId));
      setTransactions((prev) => prev.filter((t) => !importedIds.has(t.tempId)));
    } catch (err: any) {
      setImportError(err?.message || "Failed to import transactions.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar />

      <main className="max-w-[1100px] mx-auto p-4 sm:p-6 space-y-6">
        {/* Header Breadcrumbs & Title */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <Link href="/transactions" className="hover:text-[#0F766E] transition-colors">
                Transactions
              </Link>
              <span>/</span>
              <span className="text-slate-800 font-medium">Bank Statement Analyzer</span>
            </div>
            <h1 className="text-2xl font-bold text-[#0F172A] flex items-center gap-2">
              <span>Monthly Bank Statement Analyzer</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-50 text-[#0F766E] border border-teal-200 font-semibold">
                AI Powered
              </span>
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Upload your monthly bank statement (PDF, CSV, or Image) to automatically detect transactions, review them, and add them to your account.
            </p>
          </div>

          <Link
            href="/transactions"
            className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors shadow-xs inline-flex items-center gap-1.5 self-start sm:self-auto"
          >
            ← View Transactions
          </Link>
        </div>

        {/* Upload Card */}
        <Card className="border-slate-200 shadow-sm">
          <div className="space-y-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-[#0F766E] rounded-xl p-8 text-center cursor-pointer transition-all bg-slate-50/50 hover:bg-teal-50/20 group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.csv,.txt,image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="flex flex-col items-center justify-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-teal-100/70 text-[#0F766E] flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                  📄
                </div>
                <div className="text-sm font-semibold text-slate-800">
                  {file ? file.name : "Click to upload or drag & drop bank statement"}
                </div>
                <p className="text-xs text-slate-500 max-w-md">
                  Supports Bank Statement PDFs (HDFC, SBI, ICICI, etc.), CSV spreadsheets, or Scanned Images (up to 10 MB).
                </p>
                {file && (
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-teal-50 text-[#0F766E] text-xs font-medium border border-teal-200 mt-2">
                    <span>Selected: {(file.size / 1024).toFixed(1)} KB</span>
                    <span>•</span>
                    <span>{file.type || "file"}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleLoadSampleStatement}
                className="text-xs text-[#0F766E] hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
              >
                💡 Want to test instantly? Load a Sample October Statement
              </button>

              <div className="flex items-center gap-2">
                {file && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFile(null);
                      setTransactions([]);
                      setSummary(null);
                    }}
                  >
                    Clear
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="md"
                  disabled={!file || analyzing}
                  onClick={handleAnalyze}
                  className="shadow-sm"
                >
                  {analyzing ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Extracting & Analyzing...
                    </span>
                  ) : (
                    "🔍 Analyze Statement"
                  )}
                </Button>
              </div>
            </div>

            {analyzeError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center gap-2">
                <span>⚠️</span>
                <span>{analyzeError}</span>
              </div>
            )}
          </div>
        </Card>

        {/* Success / Error Messages */}
        {importSuccess && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-xl">✅</span>
              <div>
                <p className="font-semibold text-sm">{importSuccess}</p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Your transactions ledger and dashboard analytics have been updated.
                </p>
              </div>
            </div>
            <Link
              href="/transactions"
              className="px-4 py-1.5 bg-[#16A34A] hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors whitespace-nowrap self-start sm:self-auto"
            >
              Go to Transactions →
            </Link>
          </div>
        )}

        {importError && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-center gap-2">
            <span>⚠️</span>
            <span>{importError}</span>
          </div>
        )}

        {/* Statement Overview & Metrics */}
        {summary && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header info bar */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-100 flex items-center justify-center text-xl text-[#0F766E]">
                  🏦
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">{bankName}</h2>
                  <p className="text-xs text-slate-500">
                    Period: <span className="font-medium text-slate-700">{statementPeriod || "Detected Period"}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-medium rounded-md">
                  {summary.transactionCount} transactions found
                </span>
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-medium rounded-md border border-emerald-200">
                  Ready to Import
                </span>
              </div>
            </div>

            {/* Summary Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-1">
                  <span>Total Income / Credits</span>
                  <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">↓ IN</span>
                </div>
                <div className="text-2xl font-bold text-[#16A34A]">
                  +{formatMoney(summary.totalIncomeMinor)}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Credits into your account
                </p>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-1">
                  <span>Total Expenses / Debits</span>
                  <span className="text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">↑ OUT</span>
                </div>
                <div className="text-2xl font-bold text-[#DC2626]">
                  -{formatMoney(summary.totalExpenseMinor)}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Withdrawals & spendings
                </p>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-1">
                  <span>Net Savings / Balance</span>
                  <span className="text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">NET</span>
                </div>
                <div
                  className={`text-2xl font-bold ${
                    summary.netSavingsMinor >= 0 ? "text-[#0F766E]" : "text-amber-600"
                  }`}
                >
                  {summary.netSavingsMinor >= 0 ? "+" : ""}
                  {formatMoney(summary.netSavingsMinor)}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Monthly surplus / savings
                </p>
              </div>
            </div>

            {/* Transactions Section & Import Control */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Controls bar */}
              <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-50/50">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="px-2.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-xs font-medium text-slate-700 rounded-md transition-colors cursor-pointer"
                    >
                      {visibleTransactions.every((t) => t.selected) ? "Deselect All" : "Select All"}
                    </button>
                    <span className="text-xs font-semibold text-slate-600">
                      {selectedTransactions.length} of {transactions.length} selected
                    </span>
                  </div>

                  {/* Filter tabs */}
                  <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
                    {(["ALL", "EXPENSE", "INCOME"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setTypeFilter(tab)}
                        className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                          typeFilter === tab
                            ? "bg-[#0F766E] text-white shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        {tab === "ALL" ? "All" : tab === "EXPENSE" ? "Expenses" : "Income"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="text"
                    placeholder="Search transactions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0F766E] w-48"
                  />

                  {/* The Add to Transactions Button */}
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={selectedTransactions.length === 0 || importing}
                    onClick={handleImportSelected}
                    className="bg-[#16A34A] hover:bg-emerald-700 focus:ring-emerald-600 font-semibold"
                  >
                    {importing ? (
                      <span className="flex items-center gap-1.5">
                        <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Adding to Transactions...
                      </span>
                    ) : (
                      `+ Add Selected (${selectedTransactions.length}) to Transactions`
                    )}
                  </Button>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={visibleTransactions.length > 0 && visibleTransactions.every((t) => t.selected)}
                          onChange={toggleSelectAll}
                          className="rounded text-[#0F766E] focus:ring-[#0F766E] cursor-pointer"
                        />
                      </th>
                      <th className="py-3 px-3 w-32">Date</th>
                      <th className="py-3 px-3">Description</th>
                      <th className="py-3 px-3 w-28">Type</th>
                      <th className="py-3 px-3 w-40">Category</th>
                      <th className="py-3 px-3 w-32 text-right">Amount (₹)</th>
                      <th className="py-3 px-2 w-12 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          No transactions found matching your filter.
                        </td>
                      </tr>
                    ) : (
                      visibleTransactions.map((tx) => (
                        <tr
                          key={tx.tempId}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            tx.selected ? "bg-teal-50/20" : ""
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={!!tx.selected}
                              onChange={() => toggleRowSelect(tx.tempId)}
                              className="rounded text-[#0F766E] focus:ring-[#0F766E] cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <input
                              type="date"
                              value={tx.date}
                              onChange={(e) =>
                                handleFieldChange(tx.tempId, "date", e.target.value)
                              }
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs focus:ring-1 focus:ring-[#0F766E] focus:outline-none"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              value={tx.description}
                              onChange={(e) =>
                                handleFieldChange(tx.tempId, "description", e.target.value)
                              }
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs focus:ring-1 focus:ring-[#0F766E] focus:outline-none font-medium text-slate-800"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <select
                              value={tx.type}
                              onChange={(e) =>
                                handleFieldChange(tx.tempId, "type", e.target.value)
                              }
                              className={`w-full px-2 py-1 rounded text-xs font-semibold cursor-pointer border ${
                                tx.type === "INCOME"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : "bg-rose-50 text-rose-700 border-rose-200"
                              }`}
                            >
                              <option value="EXPENSE">Expense</option>
                              <option value="INCOME">Income</option>
                            </select>
                          </td>
                          <td className="py-2.5 px-3">
                            <select
                              value={tx.categoryId}
                              onChange={(e) =>
                                handleFieldChange(tx.tempId, "categoryId", e.target.value)
                              }
                              className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs focus:ring-1 focus:ring-[#0F766E] focus:outline-none cursor-pointer"
                            >
                              {categories
                                .filter((c) => c.type === tx.type)
                                .map((cat) => (
                                  <option key={cat.id} value={cat.id}>
                                    {cat.name}
                                  </option>
                                ))}
                            </select>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={tx.amount}
                              onChange={(e) =>
                                handleFieldChange(tx.tempId, "amount", e.target.value)
                              }
                              className={`w-28 px-2 py-1 bg-white border border-slate-200 rounded text-xs text-right font-bold focus:ring-1 focus:ring-[#0F766E] focus:outline-none ${
                                tx.type === "INCOME" ? "text-emerald-700" : "text-rose-700"
                              }`}
                            />
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(tx.tempId)}
                              title="Delete row"
                              className="text-slate-400 hover:text-red-600 transition-colors cursor-pointer p-1"
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Bottom bar summary */}
              <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-600">
                <div>
                  Tip: You can edit dates, names, categories, or amounts before importing them into your account.
                </div>
                <Button
                  variant="primary"
                  size="md"
                  disabled={selectedTransactions.length === 0 || importing}
                  onClick={handleImportSelected}
                  className="bg-[#16A34A] hover:bg-emerald-700 font-semibold shadow-xs"
                >
                  {importing
                    ? "Adding..."
                    : `+ Add Selected (${selectedTransactions.length}) to Transactions`}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
