"use client";

import { useEffect, useState, useCallback } from "react";
import { Navbar } from "@/components/navbar";
import { formatMoney } from "@/lib/money";

interface Settlement {
  id: string;
  groupId: string | null;
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
  date: string;
  note: string | null;
  createdAt: string;
  fromUser: { id: string; name: string; email: string };
  toUser: { id: string; name: string; email: string };
  group: { id: string; name: string } | null;
}

interface Friend {
  id: string;
  name: string;
  email: string;
}

interface Group {
  id: string;
  name: string;
}

export default function HistoryPage() {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedFriendId, setSelectedFriendId] = useState<string>("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFilters = async () => {
    try {
      const [friendsRes, groupsRes] = await Promise.all([
        fetch("/api/friends"),
        fetch("/api/groups"),
      ]);
      if (friendsRes.ok) {
        const data = await friendsRes.json();
        setFriends(data.friends || []);
      }
      if (groupsRes.ok) {
        const data = await groupsRes.json();
        setGroups(data.groups || []);
      }
    } catch (err) {
      console.error("Failed to load filters:", err);
    }
  };

  const fetchSettlements = useCallback(async (isPolling = false) => {
    try {
      if (!isPolling) setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (selectedGroupId) {
        params.append("groupId", selectedGroupId);
      } else if (selectedFriendId) {
        params.append("friendId", selectedFriendId);
      }

      const res = await fetch(`/api/settlements?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to load settlement history");
      }
      const data = await res.json();
      setSettlements(data.settlements || []);
    } catch (err: any) {
      if (!isPolling) setError(err.message || "Failed to load settlement history");
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, [selectedFriendId, selectedGroupId]);

  useEffect(() => {
    fetchFilters();
  }, []);

  useEffect(() => {
    fetchSettlements(false);
  }, [fetchSettlements]);

  // Polling every 5 seconds while tab is visible (F16)
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchSettlements(true);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchSettlements]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-[1100px] w-full mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Settlement History</h1>
            <p className="text-sm text-slate-500 mt-1">
              Track all payments recorded between you, your friends, and groups.
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-2">
              <label htmlFor="filter-group" className="text-xs font-semibold uppercase text-slate-500">
                Group:
              </label>
              <select
                id="filter-group"
                value={selectedGroupId}
                onChange={(e) => {
                  setSelectedGroupId(e.target.value);
                  if (e.target.value) setSelectedFriendId("");
                }}
                className="text-sm border border-slate-300 rounded-md px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              >
                <option value="">All Groups</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <label htmlFor="filter-friend" className="text-xs font-semibold uppercase text-slate-500">
                Friend:
              </label>
              <select
                id="filter-friend"
                value={selectedFriendId}
                onChange={(e) => {
                  setSelectedFriendId(e.target.value);
                  if (e.target.value) setSelectedGroupId("");
                }}
                className="text-sm border border-slate-300 rounded-md px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
              >
                <option value="">All Friends</option>
                {friends.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.email})
                  </option>
                ))}
              </select>
            </div>

            {(selectedGroupId || selectedFriendId) && (
              <button
                onClick={() => {
                  setSelectedGroupId("");
                  setSelectedFriendId("");
                }}
                className="text-xs text-[#0F766E] hover:underline font-medium"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0F766E] mx-auto mb-3" />
            <p className="text-sm text-slate-500 font-medium">Loading settlements...</p>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-6 text-center shadow-sm">
            <p className="font-semibold text-sm">{error}</p>
            <button
              onClick={() => fetchSettlements(false)}
              className="mt-3 px-4 py-1.5 text-xs bg-red-600 text-white font-medium rounded-md hover:bg-red-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && settlements.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-800">No settlements found</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
              {selectedGroupId || selectedFriendId
                ? "No payments recorded matching your selected filter."
                : "Payments recorded between you and friends or within groups will appear here."}
            </p>
          </div>
        )}

        {/* Settlements Table */}
        {!loading && !error && settlements.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-500 tracking-wider">
                  <tr>
                    <th scope="col" className="px-6 py-3.5">Date</th>
                    <th scope="col" className="px-6 py-3.5">From</th>
                    <th scope="col" className="px-6 py-3.5">To</th>
                    <th scope="col" className="px-6 py-3.5">Amount</th>
                    <th scope="col" className="px-6 py-3.5">Group / Type</th>
                    <th scope="col" className="px-6 py-3.5">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {settlements.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-slate-600 font-mono text-xs">
                        {s.date}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-900">
                        {s.fromUser.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-900">
                        {s.toUser.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-semibold text-[#0F766E]">
                        {formatMoney(s.amountMinor)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {s.group ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-800 border border-teal-200">
                            {s.group.name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                            One-on-One
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-500 max-w-xs truncate">
                        {s.note || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
