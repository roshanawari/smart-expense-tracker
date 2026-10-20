"use client";

import React, { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Card, Button, Input, FormModal } from "@/components/ui";
import { formatMoney, toPaise } from "@/lib/money";

interface GroupMember {
  id: string;
  name: string;
  email: string;
  balanceMinor: number;
}

interface SharedExpense {
  id: string;
  description: string;
  totalMinor: number;
  date: string;
  createdById: string;
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

interface GroupDetailData {
  group: { id: string; name: string; createdById: string; createdAt: string };
  members: GroupMember[];
  userBalanceMinor: number;
  expenses: SharedExpense[];
  settlements: Settlement[];
}

interface FriendOption {
  id: string;
  name: string;
  email: string;
}

export default function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id: groupId } = use(params);

  const [data, setData] = useState<GroupDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [userName, setUserName] = useState<string>("");

  // Add Member Modal
  const [addMemberModalOpen, setAddMemberModalOpen] = useState(false);
  const [availableFriends, setAvailableFriends] = useState<FriendOption[]>([]);
  const [selectedFriendToAdd, setSelectedFriendToAdd] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);

  // Settle up modal
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [settlePayerId, setSettlePayerId] = useState("");
  const [settleReceiverId, setSettleReceiverId] = useState("");
  const [settleAmount, setSettleAmount] = useState("");
  const [settleNote, setSettleNote] = useState("");
  const [settleSubmitting, setSettleSubmitting] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);

  // Simplify Debts
  const [simplifyOpen, setSimplifyOpen] = useState(false);
  const [simplifyLoading, setSimplifyLoading] = useState(false);
  const [simplifyData, setSimplifyData] = useState<{
    simplifiedPayments: {
      fromUserId: string;
      fromUserName: string;
      toUserId: string;
      toUserName: string;
      amountMinor: number;
    }[];
    rawDebtCount: number;
    simplifiedCount: number;
  } | null>(null);
  const [simplifyError, setSimplifyError] = useState<string | null>(null);

  const fetchSimplify = async () => {
    setSimplifyLoading(true);
    setSimplifyError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/simplify`);
      if (!res.ok) throw new Error("Failed to simplify debts");
      const json = await res.json();
      setSimplifyData(json);
    } catch (err: any) {
      setSimplifyError(err.message || "Failed to simplify debts");
    } finally {
      setSimplifyLoading(false);
    }
  };

  const fetchGroupData = useCallback(
    async (isPolling = false) => {
      if (!isPolling) setLoading(true);
      try {
        const res = await fetch(`/api/groups/${groupId}`);
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (res.status === 404) {
          setError("Group not found");
          return;
        }
        if (!res.ok) {
          throw new Error("Failed to load group details");
        }
        const json = await res.json();
        setData(json);

        if (!isPolling) {
          const meRes = await fetch("/api/auth/me");
          if (meRes.ok) {
            const meJson = await meRes.json();
            setCurrentUserId(meJson.user.id);
            setUserName(meJson.user.name);
          }
        }
      } catch (err: any) {
        if (!isPolling) setError(err.message || "Failed to load group");
      } finally {
        if (!isPolling) setLoading(false);
      }
    },
    [groupId, router]
  );

  useEffect(() => {
    fetchGroupData();

    // 5-second polling
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchGroupData(true);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchGroupData]);

  const openAddMemberModal = async () => {
    setAddMemberError(null);
    setSelectedFriendToAdd("");
    try {
      const res = await fetch("/api/friends");
      if (res.ok) {
        const json = await res.json();
        const currentMemberIds = new Set(data?.members.map((m) => m.id) || []);
        // Only friends who are not already in this group
        const notInGroup = (json.friends || []).filter(
          (f: FriendOption) => !currentMemberIds.has(f.id)
        );
        setAvailableFriends(notInGroup);
        if (notInGroup.length > 0) {
          setSelectedFriendToAdd(notInGroup[0].id);
        }
      }
      setAddMemberModalOpen(true);
    } catch {
      setAddMemberError("Failed to fetch friends list");
      setAddMemberModalOpen(true);
    }
  };

  const handleAddMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFriendToAdd) return;
    setAddingMember(true);
    setAddMemberError(null);

    try {
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedFriendToAdd }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Failed to add member");
      }
      setAddMemberModalOpen(false);
      await fetchGroupData();
    } catch (err: any) {
      setAddMemberError(err.message || "Failed to add member");
    } finally {
      setAddingMember(false);
    }
  };

  const openSettleModal = (debtorId?: string, creditorId?: string, suggestedAmount?: string) => {
    if (!data) return;
    setSettlePayerId(debtorId || currentUserId);
    setSettleReceiverId(
      creditorId || data.members.find((m) => m.id !== currentUserId)?.id || ""
    );
    setSettleAmount(suggestedAmount || "");
    setSettleNote("");
    setSettleError(null);
    setSettleModalOpen(true);
  };

  const handleRecordSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettleSubmitting(true);
    setSettleError(null);

    try {
      if (settlePayerId === settleReceiverId) {
        throw new Error("Payer and receiver cannot be the same person");
      }
      const amountMinor = toPaise(settleAmount.trim());

      const res = await fetch("/api/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId,
          fromUserId: settlePayerId,
          toUserId: settleReceiverId,
          amountMinor,
          date: new Date().toISOString().split("T")[0],
          note: settleNote.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || "Failed to record payment");
      }

      setSettleModalOpen(false);
      await fetchGroupData();
      if (simplifyOpen) {
        await fetchSimplify();
      }
    } catch (err: any) {
      setSettleError(err.message || "Failed to record payment");
    } finally {
      setSettleSubmitting(false);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm("Are you sure you want to delete this expense?")) return;
    try {
      const res = await fetch(`/api/expenses/${expenseId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error?.message || "Failed to delete expense");
        return;
      }
      await fetchGroupData();
    } catch {
      alert("Failed to delete expense");
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-[#F8FAFC]">
        <Navbar userName={userName} />
        <main className="max-w-[1100px] mx-auto p-4 sm:p-6">
          <div className="bg-white border border-red-200 rounded-xl p-8 text-center space-y-3">
            <h2 className="text-lg font-bold text-[#DC2626]">{error}</h2>
            <Link href="/groups">
              <Button variant="secondary" size="sm">
                ← Back to Groups
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
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link href="/groups" className="hover:text-[#0F766E] font-medium">
            Groups
          </Link>
          <span>/</span>
          <span className="text-[#0F172A] font-semibold">{data?.group.name || "..."}</span>
        </div>

        {loading && (
          <div className="space-y-4">
            <div className="bg-white h-32 rounded-xl border border-slate-200 animate-pulse" />
            <div className="bg-white h-64 rounded-xl border border-slate-200 animate-pulse" />
          </div>
        )}

        {!loading && data && (
          <>
            {/* Group Header Card */}
            <Card>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-[#0F172A]">{data.group.name}</h1>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {data.members.length} members · Created on{" "}
                    {new Date(data.group.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="mr-2 text-right">
                    {data.userBalanceMinor === 0 ? (
                      <span className="text-sm font-semibold text-slate-500">Settled up</span>
                    ) : data.userBalanceMinor > 0 ? (
                      <div>
                        <p className="text-xs text-[#16A34A] font-medium">you are owed</p>
                        <p className="text-lg font-bold font-mono text-[#16A34A]">
                          {formatMoney(data.userBalanceMinor)}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs text-[#DC2626] font-medium">you owe</p>
                        <p className="text-lg font-bold font-mono text-[#DC2626]">
                          {formatMoney(Math.abs(data.userBalanceMinor))}
                        </p>
                      </div>
                    )}
                  </div>

                  <Link href={`/expenses/new?groupId=${data.group.id}`}>
                    <Button variant="primary" size="md">
                      + Add expense
                    </Button>
                  </Link>

                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => {
                      const next = !simplifyOpen;
                      setSimplifyOpen(next);
                      if (next) fetchSimplify();
                    }}
                  >
                    Simplify debts
                  </Button>

                  <Button variant="secondary" size="md" onClick={() => openSettleModal()}>
                    Settle up
                  </Button>
                </div>
              </div>
            </Card>

            {simplifyOpen && (
              <Card title="Debt Simplification">
                {simplifyLoading ? (
                  <div className="py-6 text-center text-sm text-slate-500">
                    Calculating simplified debts...
                  </div>
                ) : simplifyError ? (
                  <div className="py-4 text-center text-sm text-red-600">{simplifyError}</div>
                ) : simplifyData && simplifyData.simplifiedPayments.length === 0 ? (
                  <div className="py-6 text-center text-sm text-slate-500">
                    All members are settled up! No payments needed.
                  </div>
                ) : simplifyData ? (
                  <div className="space-y-4">
                    <div className="bg-teal-50 border border-teal-200 text-[#0F766E] px-4 py-2.5 rounded-lg text-xs font-medium flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <span className="font-semibold text-sm">
                        {simplifyData.simplifiedCount} payments instead of {simplifyData.rawDebtCount}
                      </span>
                      <span className="text-[11px] text-teal-700">
                        Suggestions only · No balances are changed until recorded
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {simplifyData.simplifiedPayments.map((p, idx) => (
                        <div
                          key={idx}
                          className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div className="text-sm">
                            <span className="font-semibold text-[#0F172A]">{p.fromUserName}</span>
                            <span className="text-slate-500"> pays </span>
                            <span className="font-semibold text-[#0F172A]">{p.toUserName}</span>
                            <span className="font-mono font-bold text-[#0F766E] ml-2 text-base">
                              {formatMoney(p.amountMinor)}
                            </span>
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              openSettleModal(
                                p.fromUserId,
                                p.toUserId,
                                (p.amountMinor / 100).toFixed(2)
                              )
                            }
                          >
                            Record payment
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Members & Balances */}
              <div className="lg:col-span-1 space-y-6">
                <Card
                  title="Group Members"
                  action={
                    <Button variant="ghost" size="sm" onClick={openAddMemberModal}>
                      + Add member
                    </Button>
                  }
                >
                  <div className="divide-y divide-slate-100 -mx-5 px-5">
                    {data.members.map((member) => (
                      <div
                        key={member.id}
                        className="py-3 flex items-center justify-between text-sm"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-medium text-[#0F172A] truncate">
                            {member.name} {member.id === currentUserId && "(You)"}
                          </p>
                          <p className="text-xs text-slate-400 truncate">{member.email}</p>
                        </div>
                        <div className="text-right font-mono font-semibold shrink-0 text-xs">
                          {member.balanceMinor === 0 ? (
                            <span className="text-slate-400 font-normal">₹0.00</span>
                          ) : member.balanceMinor > 0 ? (
                            <span className="text-[#16A34A]">
                              +{formatMoney(member.balanceMinor)}
                            </span>
                          ) : (
                            <span className="text-[#DC2626]">
                              -{formatMoney(Math.abs(member.balanceMinor))}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              {/* Right Column: Shared Expenses & Settlements */}
              <div className="lg:col-span-2 space-y-6">
                <Card title="Group Expenses">
                  {data.expenses.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-sm">
                      No group expenses yet. Click{" "}
                      <Link
                        href={`/expenses/new?groupId=${data.group.id}`}
                        className="text-[#0F766E] font-medium underline"
                      >
                        + Add expense
                      </Link>{" "}
                      to split your first bill.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 -mx-5 px-5">
                      {data.expenses.map((exp) => {
                        const canEditDelete = exp.createdById === currentUserId;
                        return (
                          <div
                            key={exp.id}
                            className="py-3.5 flex items-start justify-between gap-4"
                          >
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-[#0F172A]">
                                {exp.description}
                              </p>
                              <p className="text-xs text-slate-400">
                                {exp.date} · Paid by{" "}
                                <span className="font-medium text-slate-600">
                                  {exp.paidBy.id === currentUserId ? "You" : exp.paidBy.name}
                                </span>
                              </p>
                              <div className="flex flex-wrap gap-1 text-[11px] text-slate-500">
                                {exp.shares.map((s) => (
                                  <span
                                    key={s.user.id}
                                    className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-mono"
                                  >
                                    {s.user.name}: {formatMoney(s.shareMinor)}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <div className="text-right shrink-0 space-y-1.5">
                              <p className="text-sm font-bold font-mono text-[#0F172A]">
                                {formatMoney(exp.totalMinor)}
                              </p>
                              {canEditDelete && (
                                <div className="flex items-center gap-1.5 justify-end">
                                  <Link href={`/expenses/${exp.id}/edit`}>
                                    <button className="text-xs text-slate-500 hover:text-[#0F766E] font-medium cursor-pointer">
                                      Edit
                                    </button>
                                  </Link>
                                  <span className="text-slate-300">·</span>
                                  <button
                                    onClick={() => handleDeleteExpense(exp.id)}
                                    className="text-xs text-slate-500 hover:text-[#DC2626] font-medium cursor-pointer"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
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
            </div>
          </>
        )}
      </main>

      {/* Add Member Modal */}
      <FormModal
        isOpen={addMemberModalOpen}
        title="Add Member to Group"
        onClose={() => setAddMemberModalOpen(false)}
      >
        <form onSubmit={handleAddMemberSubmit} className="space-y-4">
          {availableFriends.length === 0 ? (
            <p className="text-sm text-slate-500">
              All of your friends are already in this group.{" "}
              <Link href="/friends" className="text-[#0F766E] underline">
                Add more friends
              </Link>{" "}
              first.
            </p>
          ) : (
            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-1.5">
                Choose from your friends
              </label>
              <select
                value={selectedFriendToAdd}
                onChange={(e) => setSelectedFriendToAdd(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0F766E]/20"
              >
                {availableFriends.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.email})
                  </option>
                ))}
              </select>
            </div>
          )}

          {addMemberError && <p className="text-xs text-[#DC2626]">{addMemberError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAddMemberModalOpen(false)}
              disabled={addingMember}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={addingMember || availableFriends.length === 0}
            >
              {addingMember ? "Adding..." : "Add to group"}
            </Button>
          </div>
        </form>
      </FormModal>

      {/* Settle Up Modal */}
      <FormModal
        isOpen={settleModalOpen}
        title="Record Payment in Group"
        onClose={() => setSettleModalOpen(false)}
      >
        <form onSubmit={handleRecordSettlement} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Who paid?</label>
            <select
              value={settlePayerId}
              onChange={(e) => setSettlePayerId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
            >
              {data?.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.id === currentUserId && "(You)"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#0F172A] mb-1.5">Who received?</label>
            <select
              value={settleReceiverId}
              onChange={(e) => setSettleReceiverId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
            >
              {data?.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.id === currentUserId && "(You)"}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Amount (₹)"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={settleAmount}
            onChange={(e) => setSettleAmount(e.target.value)}
            required
          />

          <Input
            label="Note (Optional)"
            type="text"
            placeholder="e.g. Dinner settlement"
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
