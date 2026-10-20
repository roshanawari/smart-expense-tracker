"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Card, Button } from "@/components/ui";
import { formatMoney } from "@/lib/money";

interface GroupItem {
  id: string;
  name: string;
  createdById: string;
  memberCount: number;
  balanceMinor: number;
  createdAt: string;
}

export default function GroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");

  const fetchGroups = useCallback(
    async (isPolling = false) => {
      if (!isPolling) setLoading(true);
      try {
        const res = await fetch("/api/groups");
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        if (!res.ok) {
          throw new Error("Failed to load groups");
        }
        const data = await res.json();
        setGroups(data.groups || []);

        if (!isPolling) {
          const meRes = await fetch("/api/auth/me");
          if (meRes.ok) {
            const meData = await meRes.json();
            setUserName(meData.user.name);
          }
        }
      } catch (err: any) {
        if (!isPolling) setError(err.message || "Failed to load groups");
      } finally {
        if (!isPolling) setLoading(false);
      }
    },
    [router]
  );

  useEffect(() => {
    fetchGroups();

    // 5-second live polling
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchGroups(true);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchGroups]);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar userName={userName} />

      <main className="max-w-[1100px] mx-auto p-4 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Groups</h1>
            <p className="text-sm text-slate-500 mt-1">
              Split trips, shared apartments, and group dinners with friends.
            </p>
          </div>
          <Link href="/groups/new">
            <Button variant="primary" size="md">
              + New group
            </Button>
          </Link>
        </div>

        {error && (
          <div className="bg-white border border-red-200 rounded-xl p-6 text-center shadow-xs">
            <p className="text-sm font-semibold text-[#DC2626] mb-1">Something went wrong</p>
            <p className="text-xs text-slate-500 mb-4">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => fetchGroups()}>
              Try again
            </Button>
          </div>
        )}

        {loading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white h-32 rounded-xl border border-slate-200 animate-pulse" />
            <div className="bg-white h-32 rounded-xl border border-slate-200 animate-pulse" />
          </div>
        )}

        {!loading && !error && groups.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs space-y-3">
            <div className="w-12 h-12 rounded-full bg-teal-50 text-[#0F766E] mx-auto flex items-center justify-center text-xl">
              🏖️
            </div>
            <h3 className="text-lg font-semibold text-[#0F172A]">No groups yet</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              Create a group with your friends to split shared household or travel expenses.
            </p>
            <div className="pt-2">
              <Link href="/groups/new">
                <Button variant="primary" size="md">
                  + New group
                </Button>
              </Link>
            </div>
          </div>
        )}

        {!loading && !error && groups.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map((group) => {
              const isOwed = group.balanceMinor > 0;
              const owes = group.balanceMinor < 0;
              const settled = group.balanceMinor === 0;

              return (
                <Link
                  key={group.id}
                  href={`/groups/${group.id}`}
                  className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-[#0F766E]/50 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-[#0F172A] text-base line-clamp-1">
                        {group.name}
                      </h3>
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium shrink-0">
                        {group.memberCount} members
                      </span>
                    </div>
                  </div>

                  <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs text-slate-500">Your balance:</span>
                    <div>
                      {settled && (
                        <span className="text-xs font-semibold text-slate-400">Settled up</span>
                      )}
                      {isOwed && (
                        <span className="text-xs font-bold font-mono text-[#16A34A]">
                          + {formatMoney(group.balanceMinor)}
                        </span>
                      )}
                      {owes && (
                        <span className="text-xs font-bold font-mono text-[#DC2626]">
                          - {formatMoney(Math.abs(group.balanceMinor))}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
