"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { Card, Button, Input, ProgressBar, ConfirmDialog, FormModal } from "@/components/ui";
import { formatMoney, toPaise, toMajorString } from "@/lib/money";

interface Goal {
  id: string;
  name: string;
  targetMinor: number;
  savedMinor: number;
  targetDate: string | null;
  percentage: number;
  isReached: boolean;
  createdAt: string;
}

export default function GoalsPage() {
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");

  // Create / Edit modal state
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [formName, setFormName] = useState("");
  const [formTarget, setFormTarget] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Add Savings modal state
  const [savingsModalOpen, setSavingsModalOpen] = useState(false);
  const [savingsGoal, setSavingsGoal] = useState<Goal | null>(null);
  const [savingsAmount, setSavingsAmount] = useState("");
  const [savingsSubmitting, setSavingsSubmitting] = useState(false);
  const [savingsError, setSavingsError] = useState<string | null>(null);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [goalToDelete, setGoalToDelete] = useState<Goal | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const loadGoals = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/goals");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || "Failed to load goals");
      }
      const json = await res.json();
      setGoals(json.goals || []);

      const meRes = await fetch("/api/auth/me");
      if (meRes.ok) {
        const meJson = await meRes.json();
        setUserName(meJson.user.name);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load goals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGoals();
  }, []);

  const openCreateModal = () => {
    setEditingGoal(null);
    setFormName("");
    setFormTarget("");
    setFormDate("");
    setFormError(null);
    setFormModalOpen(true);
  };

  const openEditModal = (goal: Goal) => {
    setEditingGoal(goal);
    setFormName(goal.name);
    setFormTarget(toMajorString(goal.targetMinor));
    setFormDate(goal.targetDate || "");
    setFormError(null);
    setFormModalOpen(true);
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError(null);

    try {
      if (!formName.trim()) {
        throw new Error("Goal name is required");
      }
      const targetMinor = toPaise(formTarget.trim());

      const url = editingGoal ? `/api/goals/${editingGoal.id}` : "/api/goals";
      const method = editingGoal ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          targetMinor,
          targetDate: formDate ? formDate : null,
        }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error?.message || "Failed to save goal");
      }

      setFormModalOpen(false);
      await loadGoals();
    } catch (err: any) {
      setFormError(err.message || "Failed to save goal");
    } finally {
      setFormSubmitting(false);
    }
  };

  const openSavingsModal = (goal: Goal) => {
    setSavingsGoal(goal);
    setSavingsAmount("");
    setSavingsError(null);
    setSavingsModalOpen(true);
  };

  const handleAddSavings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!savingsGoal) return;
    setSavingsSubmitting(true);
    setSavingsError(null);

    try {
      const amountMinor = toPaise(savingsAmount.trim());
      const res = await fetch(`/api/goals/${savingsGoal.id}/savings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountMinor }),
      });

      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error?.message || "Failed to add savings");
      }

      setSavingsModalOpen(false);
      await loadGoals();
    } catch (err: any) {
      setSavingsError(err.message || "Failed to add savings");
    } finally {
      setSavingsSubmitting(false);
    }
  };

  const openDeleteModal = (goal: Goal) => {
    setGoalToDelete(goal);
    setDeleteModalOpen(true);
  };

  const handleDeleteGoal = async () => {
    if (!goalToDelete) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`/api/goals/${goalToDelete.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const resJson = await res.json().catch(() => ({}));
        throw new Error(resJson.error?.message || "Failed to delete goal");
      }

      setDeleteModalOpen(false);
      setGoalToDelete(null);
      await loadGoals();
    } catch (err: any) {
      alert(err.message || "Failed to delete goal");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar userName={userName} />

      <main className="max-w-[1100px] mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Savings Goals</h1>
            <p className="text-sm text-slate-500 mt-1">
              Set financial milestones, deposit savings, and track your progress toward your dreams.
            </p>
          </div>
          <Button variant="primary" size="md" onClick={openCreateModal}>
            + New goal
          </Button>
        </div>

        {error && (
          <div className="bg-white border border-red-200 rounded-xl p-6 text-center shadow-xs">
            <p className="text-sm font-semibold text-[#DC2626] mb-1">Something went wrong</p>
            <p className="text-xs text-slate-500 mb-4">{error}</p>
            <Button variant="secondary" size="sm" onClick={loadGoals}>
              Try again
            </Button>
          </div>
        )}

        {loading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white h-52 rounded-xl border border-slate-200 animate-pulse" />
            <div className="bg-white h-52 rounded-xl border border-slate-200 animate-pulse" />
            <div className="bg-white h-52 rounded-xl border border-slate-200 animate-pulse" />
          </div>
        )}

        {!loading && !error && goals.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs space-y-3">
            <div className="w-12 h-12 rounded-full bg-teal-50 text-[#0F766E] mx-auto flex items-center justify-center text-xl">
              🎯
            </div>
            <h3 className="text-lg font-semibold text-[#0F172A]">No goals yet</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              Start building your savings by setting your first financial goal.
            </p>
            <div className="pt-2">
              <Button variant="primary" size="md" onClick={openCreateModal}>
                + New goal
              </Button>
            </div>
          </div>
        )}

        {!loading && !error && goals.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {goals.map((goal) => (
              <Card key={goal.id} className="flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-[#0F172A] leading-snug line-clamp-2">
                      {goal.name}
                    </h3>
                    {goal.isReached ? (
                      <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-[#16A34A]">
                        Goal reached
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs font-semibold font-mono text-[#0F766E]">
                        {goal.percentage}%
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-baseline text-sm">
                      <span className="text-slate-500 text-xs">Saved / Target:</span>
                      <div className="font-mono text-right">
                        <span className="font-bold text-[#0F172A]">
                          {formatMoney(goal.savedMinor)}
                        </span>
                        <span className="text-slate-400 text-xs">
                          {" "}
                          / {formatMoney(goal.targetMinor)}
                        </span>
                      </div>
                    </div>

                    <ProgressBar
                      value={goal.savedMinor}
                      max={goal.targetMinor}
                      isOver={false}
                    />

                    {goal.targetDate && (
                      <p className="text-xs text-slate-400">
                        Target date:{" "}
                        <span className="text-slate-600 font-medium">{goal.targetDate}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => openSavingsModal(goal)}
                  >
                    Add savings
                  </Button>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openEditModal(goal)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      onClick={() => openDeleteModal(goal)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Create / Edit Goal Modal */}
      <FormModal
        isOpen={formModalOpen}
        title={editingGoal ? "Edit Savings Goal" : "New Savings Goal"}
        onClose={() => setFormModalOpen(false)}
      >
        <form onSubmit={handleSaveGoal} className="space-y-4">
          <Input
            label="Goal Name"
            type="text"
            placeholder="e.g. Emergency Fund, New Laptop"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            required
            maxLength={50}
          />

          <Input
            label="Target Amount (₹)"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 50000"
            value={formTarget}
            onChange={(e) => setFormTarget(e.target.value)}
            required
          />

          <Input
            label="Target Date (Optional)"
            type="date"
            value={formDate}
            onChange={(e) => setFormDate(e.target.value)}
          />

          {formError && <p className="text-xs text-[#DC2626]">{formError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setFormModalOpen(false)}
              disabled={formSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={formSubmitting}>
              {formSubmitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </FormModal>

      {/* Add Savings Modal */}
      <FormModal
        isOpen={savingsModalOpen}
        title={`Add Savings to "${savingsGoal?.name}"`}
        onClose={() => setSavingsModalOpen(false)}
      >
        <form onSubmit={handleAddSavings} className="space-y-4">
          <p className="text-xs text-slate-500">
            Current balance:{" "}
            <span className="font-semibold text-slate-700">
              {formatMoney(savingsGoal?.savedMinor || 0)}
            </span>{" "}
            of {formatMoney(savingsGoal?.targetMinor || 0)}
          </p>

          <Input
            label="Contribution Amount (₹)"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 5000"
            value={savingsAmount}
            onChange={(e) => setSavingsAmount(e.target.value)}
            required
            autoFocus
          />

          {savingsError && <p className="text-xs text-[#DC2626]">{savingsError}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSavingsModalOpen(false)}
              disabled={savingsSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={savingsSubmitting}>
              {savingsSubmitting ? "Adding..." : "Save"}
            </Button>
          </div>
        </form>
      </FormModal>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={deleteModalOpen}
        title="Delete Savings Goal"
        message={`Are you sure you want to delete "${goalToDelete?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        isLoading={deleteSubmitting}
        onConfirm={handleDeleteGoal}
        onCancel={() => {
          setDeleteModalOpen(false);
          setGoalToDelete(null);
        }}
      />
    </div>
  );
}
