"use client";

import React, { useEffect, useState, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Card, Button, Input } from "@/components/ui";
import { formatMoney, toPaise, toMajorString } from "@/lib/money";
import { splitEqual } from "@/lib/split";

interface Member {
  id: string;
  name: string;
}

export default function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id: expenseId } = use(params);

  const [description, setDescription] = useState("");
  const [totalStr, setTotalStr] = useState("");
  const [date, setDate] = useState("");
  const [paidById, setPaidById] = useState("");
  const [splitMethod, setSplitMethod] = useState<"EQUAL" | "PERCENT" | "EXACT">("EQUAL");

  const [members, setMembers] = useState<Member[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [percentInputs, setPercentInputs] = useState<Record<string, string>>({});
  const [exactInputs, setExactInputs] = useState<Record<string, string>>({});

  const [groupId, setGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
    async function init() {
      setLoading(true);
      setError(null);
      try {
        const [expRes, meRes] = await Promise.all([
          fetch(`/api/expenses/${expenseId}`),
          fetch("/api/auth/me"),
        ]);

        if (expRes.status === 401) {
          router.push("/login");
          return;
        }
        if (expRes.status === 404) {
          setError("Expense not found");
          return;
        }
        if (!expRes.ok) throw new Error("Failed to load expense");

        const json = await expRes.json();
        const exp = json.expense;

        setDescription(exp.description);
        setTotalStr(toMajorString(exp.totalMinor));
        setDate(exp.date);
        setPaidById(exp.paidById);
        setSplitMethod(exp.splitMethod);
        setGroupId(exp.groupId);

        if (meRes.ok) {
          const meData = await meRes.json();
          setUserName(meData.user.name);
        }

        // Setup members and selected participants
        if (exp.groupId) {
          const grpRes = await fetch(`/api/groups/${exp.groupId}`);
          if (grpRes.ok) {
            const grpJson = await grpRes.json();
            setMembers(grpJson.members.map((m: any) => ({ id: m.id, name: m.name })));
          }
        } else {
          // One-on-one
          const memMap: Record<string, string> = { [exp.paidBy.id]: exp.paidBy.name };
          for (const s of exp.shares) {
            memMap[s.user.id] = s.user.name;
          }
          setMembers(Object.entries(memMap).map(([id, name]) => ({ id, name })));
        }

        const participantIds = exp.shares.map((s: any) => s.userId);
        setSelectedUserIds(participantIds);

        const exacts: Record<string, string> = {};
        for (const s of exp.shares) {
          exacts[s.userId] = toMajorString(s.shareMinor);
        }
        setExactInputs(exacts);
      } catch (err: any) {
        setError(err.message || "Failed to load expense");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [expenseId, router]);

  const totalMinor = useMemo(() => {
    try {
      if (!totalStr.trim()) return 0;
      return toPaise(totalStr.trim());
    } catch {
      return 0;
    }
  }, [totalStr]);

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

  const handleUpdate = async (e: React.FormEvent) => {
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

      const res = await fetch(`/api/expenses/${expenseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          totalMinor,
          date,
          paidById,
          splitMethod,
          participants: participantsPayload,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Failed to update expense");
      }

      if (groupId) {
        router.push(`/groups/${groupId}`);
      } else {
        router.push("/friends");
      }
    } catch (err: any) {
      setError(err.message || "Failed to update expense");
    } finally {
      setSubmitting(false);
    }
  };

  const backLink = groupId ? `/groups/${groupId}` : "/friends";

  if (error && !loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <Navbar userName={userName} />
        <main className="max-w-[700px] mx-auto p-4 sm:p-6">
          <div className="bg-white border border-red-200 rounded-xl p-8 text-center space-y-3">
            <h2 className="text-lg font-bold text-[#DC2626]">{error}</h2>
            <Link href={backLink}>
              <Button variant="secondary" size="sm">
                ← Go back
              </Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar userName={userName} />

      <main className="max-w-[700px] mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#0F172A]">Edit Expense</h1>
          <Link href={backLink}>
            <Button variant="secondary" size="sm">
              Cancel
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="bg-white h-72 rounded-xl border border-slate-200 animate-pulse" />
        ) : (
          <Card>
            <form onSubmit={handleUpdate} className="space-y-5">
              <Input
                label="Description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Total Amount (₹)"
                  type="text"
                  inputMode="decimal"
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

              {/* Participants */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-[#0F172A]">Participants:</label>
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
                                  value={percentInputs[m.id] || ""}
                                  onChange={(e) =>
                                    setPercentInputs((prev) => ({
                                      ...prev,
                                      [m.id]: e.target.value,
                                    }))
                                  }
                                  className="w-16 px-2 py-1 text-xs border border-slate-300 rounded font-mono text-right"
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
                                  value={exactInputs[m.id] || ""}
                                  onChange={(e) =>
                                    setExactInputs((prev) => ({
                                      ...prev,
                                      [m.id]: e.target.value,
                                    }))
                                  }
                                  className="w-20 px-2 py-1 text-xs border border-slate-300 rounded font-mono text-right"
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
                  {submitting ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </form>
          </Card>
        )}
      </main>
    </div>
  );
}
