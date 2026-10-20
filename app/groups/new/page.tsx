"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Card, Button, Input } from "@/components/ui";

interface Friend {
  id: string;
  name: string;
  email: string;
}

export default function NewGroupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
    async function init() {
      try {
        const [friendsRes, meRes] = await Promise.all([
          fetch("/api/friends"),
          fetch("/api/auth/me"),
        ]);
        if (friendsRes.status === 401) {
          router.push("/login");
          return;
        }
        if (friendsRes.ok) {
          const data = await friendsRes.json();
          setFriends(data.friends || []);
        }
        if (meRes.ok) {
          const meData = await meRes.json();
          setUserName(meData.user.name);
        }
      } catch (err: any) {
        setError(err.message || "Failed to load friends");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [router]);

  const toggleFriend = (id: string) => {
    setSelectedFriendIds((prev) =>
      prev.includes(id) ? prev.filter((fid) => fid !== id) : [...prev, id]
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Group name is required");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          memberIds: selectedFriendIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || "Failed to create group");
      }

      router.push(`/groups/${data.group.id}`);
    } catch (err: any) {
      setError(err.message || "Failed to create group");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <Navbar userName={userName} />

      <main className="max-w-[700px] mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Create a New Group</h1>
          <p className="text-sm text-slate-500 mt-1">
            Pick a group name and choose which friends to invite.
          </p>
        </div>

        <Card>
          <form onSubmit={handleCreate} className="space-y-6">
            <Input
              label="Group Name"
              type="text"
              placeholder="e.g. Summer Vacation, Flat 4B"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              required
              maxLength={50}
            />

            <div>
              <label className="block text-sm font-medium text-[#0F172A] mb-2">
                Select Members (from your Friends)
              </label>

              {loading ? (
                <div className="p-4 text-center text-slate-400 text-sm">Loading friends...</div>
              ) : friends.length === 0 ? (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500">
                  You don't have any friends added yet.{" "}
                  <Link href="/friends" className="text-[#0F766E] font-medium underline">
                    Add friends first
                  </Link>{" "}
                  or create this group now and add members later.
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg bg-white">
                  {friends.map((friend) => {
                    const checked = selectedFriendIds.includes(friend.id);
                    return (
                      <label
                        key={friend.id}
                        className="flex items-center justify-between p-3 hover:bg-slate-50 cursor-pointer select-none"
                      >
                        <div className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleFriend(friend.id)}
                            className="w-4 h-4 text-[#0F766E] rounded border-slate-300 focus:ring-[#0F766E] cursor-pointer"
                          />
                          <div>
                            <p className="text-sm font-medium text-[#0F172A]">{friend.name}</p>
                            <p className="text-xs text-slate-400">{friend.email}</p>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {error && <p className="text-sm font-medium text-[#DC2626]">{error}</p>}

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <Link href="/groups">
                <Button variant="secondary" type="button" disabled={submitting}>
                  Cancel
                </Button>
              </Link>
              <Button variant="primary" type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </Card>
      </main>
    </div>
  );
}
