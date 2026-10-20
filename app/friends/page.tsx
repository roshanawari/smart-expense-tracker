"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Card, Button, Input } from "@/components/ui";
import { formatMoney } from "@/lib/money";

interface Friend {
  id: string;
  name: string;
  email: string;
  balanceMinor: number;
}

export default function FriendsPage() {
  const router = useRouter();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");

  // Add friend form
  const [emailInput, setEmailInput] = useState("");
  const [addingFriend, setAddingFriend] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  const fetchFriends = useCallback(async (isPolling = false) => {
    if (!isPolling) setLoading(true);
    try {
      const res = await fetch("/api/friends");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to load friends");
      }
      const data = await res.json();
      setFriends(data.friends || []);

      if (!isPolling) {
        const meRes = await fetch("/api/auth/me");
        if (meRes.ok) {
          const meData = await meRes.json();
          setUserName(meData.user.name);
        }
      }
    } catch (err: any) {
      if (!isPolling) setError(err.message || "Failed to load friends");
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchFriends();

    // 5-second polling when tab is visible
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchFriends(true);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchFriends]);

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddingFriend(true);
    setAddError(null);
    setAddSuccess(null);

    const email = emailInput.trim();
    if (!email) {
      setAddError("Please enter an email address");
      setAddingFriend(false);
      return;
    }

    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to add friend");
      }

      setEmailInput("");
      setAddSuccess(data.message || "Friend added!");
      await fetchFriends();
      setTimeout(() => setAddSuccess(null), 3000);
    } catch (err: any) {
      setAddError(err.message || "Failed to add friend");
    } finally {
      setAddingFriend(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar userName={userName} />

      <main className="max-w-[1100px] mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Friends</h1>
          <p className="text-sm text-slate-500 mt-1">
            Split expenses with registered users and keep track of who owes whom.
          </p>
        </div>

        {/* Add Friend Card */}
        <Card title="Add a Friend" subtitle="Enter your friend's registered email address">
          <form onSubmit={handleAddFriend} className="max-w-md space-y-3">
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <Input
                  type="email"
                  placeholder="friend@example.com"
                  value={emailInput}
                  onChange={(e) => {
                    setEmailInput(e.target.value);
                    if (addError) setAddError(null);
                  }}
                  error={addError || undefined}
                />
              </div>
              <Button type="submit" variant="primary" disabled={addingFriend}>
                {addingFriend ? "Adding..." : "Add friend"}
              </Button>
            </div>
            {addSuccess && (
              <p className="text-xs font-medium text-[#16A34A]">{addSuccess}</p>
            )}
          </form>
        </Card>

        {/* Friends List */}
        {error && (
          <div className="bg-white border border-red-200 rounded-xl p-6 text-center shadow-xs">
            <p className="text-sm font-semibold text-[#DC2626] mb-1">Something went wrong</p>
            <p className="text-xs text-slate-500 mb-4">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => fetchFriends()}>
              Try again
            </Button>
          </div>
        )}

        {loading && !error && (
          <div className="space-y-3">
            <div className="bg-white h-20 rounded-xl border border-slate-200 animate-pulse" />
            <div className="bg-white h-20 rounded-xl border border-slate-200 animate-pulse" />
          </div>
        )}

        {!loading && !error && friends.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs space-y-3">
            <div className="w-12 h-12 rounded-full bg-teal-50 text-[#0F766E] mx-auto flex items-center justify-center text-xl">
              👥
            </div>
            <h3 className="text-lg font-semibold text-[#0F172A]">No friends yet</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              Add a friend using their email above to start splitting shared expenses.
            </p>
          </div>
        )}

        {!loading && !error && friends.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
            {friends.map((friend) => {
              const owesYou = friend.balanceMinor > 0;
              const youOwe = friend.balanceMinor < 0;
              const settled = friend.balanceMinor === 0;

              return (
                <Link
                  key={friend.id}
                  href={`/friends/${friend.id}`}
                  className="flex items-center justify-between p-4 sm:p-5 hover:bg-slate-50/80 transition-colors block"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[#0F766E]/10 text-[#0F766E] font-bold flex items-center justify-center text-sm shrink-0">
                      {friend.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#0F172A] truncate">
                        {friend.name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{friend.email}</p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {settled && (
                      <span className="text-xs font-medium text-slate-400">Settled up</span>
                    )}
                    {owesYou && (
                      <div>
                        <p className="text-xs text-[#16A34A] font-medium">owes you</p>
                        <p className="text-sm font-bold font-mono text-[#16A34A]">
                          {formatMoney(friend.balanceMinor)}
                        </p>
                      </div>
                    )}
                    {youOwe && (
                      <div>
                        <p className="text-xs text-[#DC2626] font-medium">you owe</p>
                        <p className="text-sm font-bold font-mono text-[#DC2626]">
                          {formatMoney(Math.abs(friend.balanceMinor))}
                        </p>
                      </div>
                    )}
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
