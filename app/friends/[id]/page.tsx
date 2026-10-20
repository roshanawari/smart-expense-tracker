"use client";

import React, { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Card, Button, Input, FormModal } from "@/components/ui";
import { formatMoney, toPaise } from "@/lib/money";

interface SharedExpense {
  id: string;
  description: string;
  totalMinor: number;
  date: string;
  paidBy: { id: string; name: string };
  shares: { user: { id: string; name: string }; shareMinor: number }[];
}

interface Settlement {
  id: string;
  fromUser: { id: string; name: string };
  toUser: { id: string; name: string };
  amountMinor: number;
  date: string;
  note: string | null;
}

interface FriendDetailData {
  friend: { id: string; name: string; email: string };
  balanceMinor: number;
  expenses: SharedExpense[];
  settlements: Settlement[];
}

export default function FriendDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id: friendId } = use(params);

  const [data, setData] = useState<FriendDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [userName, setUserName] = useState<string>("");

  // Settle up modal
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [settlePayer, setSettlePayer] = useState<"me" | "them">("me");
  const [settleAmount, setSettleAmount] = useState("");
  const [settleNote, setSettleNote] = useState("");
  const [settleSubmitting, setSettleSubmitting] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);

  const fetchFriendData = useCallback(
    async (isPolling = false) => {
      if (!isPolling) setLoading(true);
      try {
        const res = await fetch(`/api/friends/${friendId}`);
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (res.status === 404) {
          setError("Friend not found");
          return;
        }
        if (!res.ok) {
          throw new Error("Failed to load friend details");
        }
        const json = await res.json();
        setData(json);

        if (!isPolling) {
          const meRes = await fetch("/api/auth/me");
          if (meRes.ok) {
            const meData = await meRes.json();
            setCurrentUserId(meData.user.id);
            setUserName(meData.user.name);
          }
        }
      } catch (err: any) {
        if (!isPolling) setError(err.message || "Failed to load details");
      } finally {
        if (!isPolling) setLoading(false);
      }
    },
    [friendId, router]
  );

  useEffect(() => {
    fetchFriendData();

    // 5-second polling when visible
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchFriendData(true);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchFriendData]);

  const openSettleModal = () => {
    if (!data) return;
    // Default who pays based on balance
    if (data.balanceMinor < 0) {
      // Current user owes friend
      setSettlePayer("me");
      setSettleAmount((Math.abs(data.balanceMinor) / 100).toFixed(2));
    } else if (data.balanceMinor > 0) {
      // Friend owes current user
      setSettlePayer("them");
      setSettleAmount((data.balanceMinor / 100).toFixed(2));
    } else {
      setSettlePayer("me");
      setSettleAmount("");
    }
    setSettleNote("");
    setSettleError(null);
    setSettleModalOpen(true);
  };

  const handleRecordSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    setSettleSubmitting(true);
    setSettleError(null);

    try {
      const amountMinor = toPaise(settleAmount.trim());
      const fromUserId = settlePayer === "me" ? currentUserId : data.friend.id;
      const toUserId = settlePayer === "me" ? data.friend.id : currentUserId;

      const res = await fetch("/api/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromUserId,
          toUserId,
          amountMinor,
          date: new Date().toISOString().split("T")[0],
          note: settleNote.trim() || undefined,
        }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error?.message || "Failed to record payment");
      }

      setSettleModalOpen(false);
      await fetchFriendData();
    } catch (err: any) {
      setSettleError(err.message || "Failed to record payment");
    } finally {
      setSettleSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <Navbar userName={userName} />
        <main className="max-w-[1100px] mx-auto p-4 sm:p-6">
          <div className="bg-white border border-red-200 rounded-xl p-8 text-center space-y-3">
            <h2 className="text-lg font-bold text-[#DC2626]">{error}</h2>
            <Link href="/friends">
              <Button variant="secondary" size="sm">
                ← Back to Friends
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

      <main className="max-w-[1100px] mx-auto p-4 sm:p-6 space-y-6">
        {/* Header Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link href="/friends" className="hover:text-[#0F766E] font-medium">
            Friends
          </Link>
          <span>/</span>
          <span className="text-[#0F172A] font-semibold">{data?.friend.name || "..."}</span>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="space-y-4">
            <div className="bg-white h-32 rounded-xl border border-slate-200 animate-pulse" />
            <div className="bg-white h-64 rounded-xl border border-slate-200 animate-pulse" />
          </div>
        )}

        {!loading && data && (
          <>
            {/* Friend Summary Card */}
            <Card>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-[#0F766E]/10 text-[#0F766E] font-bold flex items-center justify-center text-lg shrink-0">
                    {data.friend.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-[#0F172A]">{data.friend.name}</h1>
                    <p className="text-xs text-slate-500">{data.friend.email}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="mr-2 text-right">
                    {data.balanceMinor === 0 ? (
                      <span className="text-sm font-semibold text-slate-500">Settled up</span>
                    ) : data.balanceMinor > 0 ? (
                      <div>
                        <p className="text-xs text-[#16A34A] font-medium">owes you</p>
                        <p className="text-lg font-bold font-mono text-[#16A34A]">
                          {formatMoney(data.balanceMinor)}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs text-[#DC2626] font-medium">you owe</p>
                        <p className="text-lg font-bold font-mono text-[#DC2626]">
                          {formatMoney(Math.abs(data.balanceMinor))}
                        </p>
                      </div>
                    )}
                  </div>

                  <Link href={`/expenses/new?friendId=${data.friend.id}`}>
                    <Button variant="primary" size="md">
                      + Add expense
                    </Button>
                  </Link>

                  <Button variant="secondary" size="md" onClick={openSettleModal}>
                    Settle up
                  </Button>
                </div>
              </div>
            </Card>

            {/* Shared Expenses & Settlements Tabs / Ledger */}
            <div className="space-y-6">
              <Card title="Shared Expenses">
                {data.expenses.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">
                    No shared expenses with {data.friend.name} yet.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 -mx-5 px-5">
                    {data.expenses.map((exp) => (
                      <div
                        key={exp.id}
                        className="py-3.5 flex items-center justify-between gap-4"
                      >
                        <div>
                          <p className="text-sm font-semibold text-[#0F172A]">
                            {exp.description}
                          </p>
                          <p className="text-xs text-slate-400">
                            {exp.date} · Paid by{" "}
                            <span className="font-medium text-slate-600">
                              {exp.paidBy.id === currentUserId ? "You" : exp.paidBy.name}
                            </span>
                          </p>
                        </div>
                        <div className="text-right font-mono">
                          <p className="text-sm font-bold text-[#0F172A]">
                            {formatMoney(exp.totalMinor)}
                          </p>
                          <p className="text-xs text-slate-400">
                            Your share:{" "}
                            {formatMoney(
                              exp.shares.find((s) => s.user.id === currentUserId)?.shareMinor || 0
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {data.settlements.length > 0 && (
                <Card title="Payment History">
                  <div className="divide-y divide-slate-100 -mx-5 px-5">
                    {data.settlements.map((set) => (
                      <div
                        key={set.id}
                        className="py-3 flex items-center justify-between text-sm"
                      >
                        <div>
                          <p className="text-slate-700">
                            <span className="font-medium text-[#0F172A]">
                              {set.fromUser.id === currentUserId ? "You" : set.fromUser.name}
                            </span>{" "}
                            paid{" "}
                            <span className="font-medium text-[#0F172A]">
                              {set.toUser.id === currentUserId ? "You" : set.toUser.name}
                            </span>
                          </p>
                          <p className="text-xs text-slate-400">
                            {set.date} {set.note && `· ${set.note}`}
                          </p>
                        </div>
                        <div className="font-mono font-bold text-[#16A34A]">
                          {formatMoney(set.amountMinor)}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </>
        )}
      </main>

      {/* Settle up Modal */}
      <FormModal
        isOpen={settleModalOpen}
        title={`Settle up with ${data?.friend.name}`}
        onClose={() => setSettleModalOpen(false)}
      >
        <form onSubmit={handleRecordSettlement} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Who paid?</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSettlePayer("me")}
                className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                  settlePayer === "me"
                    ? "border-[#0F766E] bg-teal-50 text-[#0F766E]"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                I paid {data?.friend.name}
              </button>
              <button
                type="button"
                onClick={() => setSettlePayer("them")}
                className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                  settlePayer === "them"
                    ? "border-[#0F766E] bg-teal-50 text-[#0F766E]"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {data?.friend.name} paid me
              </button>
            </div>
          </div>

          <Input
            label="Amount (₹)"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={settleAmount}
            onChange={(e) => setSettleAmount(e.target.value)}
            required
            autoFocus
          />

          <Input
            label="Note (Optional)"
            type="text"
            placeholder="e.g. UPI / Cash settlement"
            value={settleNote}
            onChange={(e) => setSettleNote(e.target.value)}
          />

          {settleError && <p className="text-xs text-[#DC2626]">{settleError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSettleModalOpen(false)}
              disabled={settleSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={settleSubmitting}>
              {settleSubmitting ? "Recording..." : "Save"}
            </Button>
          </div>
        </form>
      </FormModal>
    </div>
  );
}
