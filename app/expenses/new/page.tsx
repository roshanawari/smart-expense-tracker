"use client";

import React, { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Card, Button, Input } from "@/components/ui";
import { formatMoney, toPaise } from "@/lib/money";
import { splitEqual } from "@/lib/split";

interface Member {
  id: string;
  name: string;
  email: string;
}

function NewExpenseContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryGroupId = searchParams.get("groupId");
  const queryFriendId = searchParams.get("friendId");

  const [description, setDescription] = useState("");
  const [totalStr, setTotalStr] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [paidById, setPaidById] = useState("");
  const [splitMethod, setSplitMethod] = useState<"EQUAL" | "PERCENT" | "EXACT">("EQUAL");

  const [members, setMembers] = useState<Member[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [percentInputs, setPercentInputs] = useState<Record<string, string>>({});
  const [exactInputs, setExactInputs] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [contextTitle, setContextTitle] = useState<string>("");

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
      if (json.total) setTotalStr(json.total);
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
    async function loadContext() {
      setLoading(true);
      setError(null);
      try {
        const meRes = await fetch("/api/auth/me");
        if (meRes.status === 401) {
          router.push("/login");
          return;
        }
        let currentUid = "";
        if (meRes.ok) {
          const meData = await meRes.json();
          currentUid = meData.user.id;
          setUserName(meData.user.name);
          setPaidById(currentUid);
        }

        if (queryGroupId) {
          const res = await fetch(`/api/groups/${queryGroupId}`);
          if (!res.ok) throw new Error("Failed to load group");
          const json = await res.json();
          setContextTitle(`Group: ${json.group.name}`);
          const mems: Member[] = json.members.map((m: any) => ({
            id: m.id,
            name: m.name,
            email: m.email,
          }));
          setMembers(mems);
          setSelectedUserIds(mems.map((m) => m.id));
        } else if (queryFriendId) {
          const res = await fetch(`/api/friends/${queryFriendId}`);
          if (!res.ok) throw new Error("Failed to load friend");
          const json = await res.json();
          setContextTitle(`Friend: ${json.friend.name}`);
          const mems: Member[] = [
            { id: currentUid, name: "You", email: "" },
            { id: json.friend.id, name: json.friend.name, email: json.friend.email },
          ];
          setMembers(mems);
          setSelectedUserIds(mems.map((m) => m.id));
        } else {
          setError("No group or friend specified for this expense");
        }
      } catch (err: any) {
        setError(err.message || "Failed to initialize expense form");
      } finally {
        setLoading(false);
      }
    }
    loadContext();
  }, [queryGroupId, queryFriendId, router]);

  const totalMinor = useMemo(() => {
    try {
      if (!totalStr.trim()) return 0;
      return toPaise(totalStr.trim());
    } catch {
      return 0;
    }
  }, [totalStr]);

  // Live split calculations
  const equalShares = useMemo(() => {
    if (totalMinor <= 0 || selectedUserIds.length === 0) return {};
    try {
      const shares = splitEqual(totalMinor, selectedUserIds);
      const map: Record<string, number> = {};
      for (const s of shares) map[s.userId] = s.shareMinor;
      return map;
    } catch {
      return {};
    }
  }, [totalMinor, selectedUserIds]);

  const percentSum = useMemo(() => {
    return selectedUserIds.reduce((sum, uid) => {
      const val = parseFloat(percentInputs[uid] || "0");
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }, [selectedUserIds, percentInputs]);

  const exactSumMinor = useMemo(() => {
    return selectedUserIds.reduce((sum, uid) => {
      try {
        const val = exactInputs[uid];
        return sum + (val ? toPaise(val) : 0);
      } catch {
        return sum;
      }
    }, 0);
  }, [selectedUserIds, exactInputs]);

  const toggleParticipant = (uid: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError("Description is required");
      return;
    }
    if (totalMinor <= 0) {
      setError("Total amount must be greater than 0");
      return;
    }
    if (selectedUserIds.length === 0) {
      setError("Please select at least one participant");
      return;
    }

    if (splitMethod === "PERCENT") {
      if (Math.abs(percentSum - 100) > 0.01) {
        setError(`Percentages must sum to 100%. Remaining: ${(100 - percentSum).toFixed(2)}%`);
        return;
      }
    } else if (splitMethod === "EXACT") {
      if (exactSumMinor !== totalMinor) {
        const diffMinor = totalMinor - exactSumMinor;
        setError(
          `Exact shares must sum to total. Remaining: ${formatMoney(Math.abs(diffMinor))}`
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const participantsPayload = selectedUserIds.map((uid) => {
        if (splitMethod === "PERCENT") {
          return { userId: uid, percent: parseFloat(percentInputs[uid] || "0") };
        } else if (splitMethod === "EXACT") {
          return { userId: uid, amountMinor: toPaise(exactInputs[uid] || "0") };
        }
        return { userId: uid };
      });

      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          totalMinor,
          date,
          paidById,
          groupId: queryGroupId || null,
          friendId: queryFriendId || null,
          splitMethod,
          participants: participantsPayload,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Failed to save expense");
      }

      if (queryGroupId) {
        router.push(`/groups/${queryGroupId}`);
      } else if (queryFriendId) {
        router.push(`/friends/${queryFriendId}`);
      } else {
        router.push("/dashboard");
      }
    } catch (err: any) {
      setError(err.message || "Failed to save expense");
    } finally {
      setSubmitting(false);
    }
  };

  const backLink = queryGroupId
    ? `/groups/${queryGroupId}`
    : queryFriendId
    ? `/friends/${queryFriendId}`
    : "/dashboard";

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar userName={userName} />

      <main className="max-w-[700px] mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Add an Expense</h1>
            {contextTitle && <p className="text-xs text-slate-500 mt-0.5">{contextTitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            <label
              htmlFor="expense-bill-upload"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-sm cursor-pointer ${
                scanning ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              <svg className="w-3.5 h-3.5 text-[#0F766E]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {scanning ? "Reading bill..." : "Scan bill"}
            </label>
            <input
              id="expense-bill-upload"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={scanning}
              onChange={handleFileScan}
            />

            <Link href={backLink}>
              <Button variant="secondary" size="sm">
                Cancel
              </Button>
            </Link>
          </div>
        </div>

        {scanError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3.5 text-sm flex items-center justify-between">
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
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-3.5 text-xs space-y-2">
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

        {error && (
          <div className="bg-white border border-red-200 rounded-xl p-4 text-sm text-[#DC2626]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white h-72 rounded-xl border border-slate-200 animate-pulse" />
        ) : (
          <Card>
            <form onSubmit={handleSave} className="space-y-5">
              <Input
                label="Description"
                type="text"
                placeholder="e.g. Dinner at Olive, Grocery shopping"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Total Amount (₹)"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={totalStr}
                  onChange={(e) => setTotalStr(e.target.value)}
                  required
                />

                <Input
                  label="Date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                  Paid by
                </label>
                <select
                  value={paidById}
                  onChange={(e) => setPaidById(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
                >
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Split Method Tabs */}
              <div>
                <label className="block text-sm font-medium text-[#0F172A] mb-2">
                  Split Method
                </label>
                <div className="flex border border-slate-200 rounded-lg p-1 bg-slate-50 gap-1">
                  {(["EQUAL", "PERCENT", "EXACT"] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setSplitMethod(method)}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                        splitMethod === method
                          ? "bg-white text-[#0F766E] shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {method === "EQUAL" ? "Equal (=)" : method === "PERCENT" ? "Percent (%)" : "Exact (₹)"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Participants and Live Allocation */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-[#0F172A]">
                    Split with participants:
                  </label>

                  {/* Live remaining feedback */}
                  {splitMethod === "PERCENT" && (
                    <span
                      className={`text-xs font-bold font-mono ${
                        Math.abs(percentSum - 100) < 0.01 ? "text-[#16A34A]" : "text-[#DC2626]"
                      }`}
                    >
                      Remaining: {(100 - percentSum).toFixed(2)}%
                    </span>
                  )}
                  {splitMethod === "EXACT" && (
                    <span
                      className={`text-xs font-bold font-mono ${
                        exactSumMinor === totalMinor ? "text-[#16A34A]" : "text-[#DC2626]"
                      }`}
                    >
                      Remaining: {formatMoney(totalMinor - exactSumMinor)}
                    </span>
                  )}
                  {splitMethod === "EQUAL" && (
                    <span className="text-xs font-medium text-slate-400">
                      Remaining: ₹0.00
                    </span>
                  )}
                </div>

                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-60 overflow-y-auto bg-white">
                  {members.map((m) => {
                    const isChecked = selectedUserIds.includes(m.id);
                    return (
                      <div
                        key={m.id}
                        className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                      >
                        <label className="flex items-center space-x-3 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleParticipant(m.id)}
                            className="w-4 h-4 text-[#0F766E] rounded border-slate-300 focus:ring-[#0F766E] cursor-pointer"
                          />
                          <span className="text-sm font-medium text-[#0F172A]">{m.name}</span>
                        </label>

                        {isChecked && (
                          <div className="flex items-center space-x-2">
                            {splitMethod === "EQUAL" && (
                              <span className="text-xs font-mono font-semibold text-slate-700">
                                {formatMoney(equalShares[m.id] || 0)}
                              </span>
                            )}

                            {splitMethod === "PERCENT" && (
                              <div className="flex items-center space-x-1">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="0"
                                  value={percentInputs[m.id] || ""}
                                  onChange={(e) =>
                                    setPercentInputs((prev) => ({
                                      ...prev,
                                      [m.id]: e.target.value,
                                    }))
                                  }
                                  className="w-16 px-2 py-1 text-xs border border-slate-300 rounded font-mono text-right focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                                />
                                <span className="text-xs text-slate-400">%</span>
                              </div>
                            )}

                            {splitMethod === "EXACT" && (
                              <div className="flex items-center space-x-1">
                                <span className="text-xs text-slate-400">₹</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="0.00"
                                  value={exactInputs[m.id] || ""}
                                  onChange={(e) =>
                                    setExactInputs((prev) => ({
                                      ...prev,
                                      [m.id]: e.target.value,
                                    }))
                                  }
                                  className="w-20 px-2 py-1 text-xs border border-slate-300 rounded font-mono text-right focus:outline-none focus:ring-1 focus:ring-[#0F766E]"
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <Link href={backLink}>
                  <Button variant="secondary" type="button" disabled={submitting}>
                    Cancel
                  </Button>
                </Link>
                <Button variant="primary" type="submit" disabled={submitting}>
                  {submitting ? "Saving..." : "Save"}
                </Button>
              </div>
            </form>
          </Card>
        )}
      </main>
    </div>
  );
}

export default function NewExpensePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center text-slate-400 text-sm">
          Loading form...
        </div>
      }
    >
      <NewExpenseContent />
    </Suspense>
  );
}
