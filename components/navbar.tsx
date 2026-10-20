"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export function Navbar({ userName }: { userName?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      setLoggingOut(false);
    }
  };

  const navLinks = [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Transactions", href: "/transactions" },
    { label: "Statements", href: "/statements" },
    { label: "Budgets", href: "/budgets" },
    { label: "Goals", href: "/goals" },
    { label: "Friends", href: "/friends" },
    { label: "Groups", href: "/groups" },
    { label: "History", href: "/history" },
  ];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center space-x-4 sm:space-x-6 min-w-0">
          <Link
            href="/dashboard"
            className="text-base sm:text-lg font-bold text-[#0F766E] flex items-center shrink-0"
          >
            <span>Smart Expense Tracker</span>
          </Link>
          <nav className="flex space-x-1 overflow-x-auto no-scrollbar py-1 text-sm">
            {navLinks.map((link) => {
              const isActive = pathname === link.href || pathname.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-2.5 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-slate-100 text-[#0F766E] font-semibold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center space-x-4">
          {userName && (
            <span className="text-sm text-slate-500 hidden sm:inline">
              {userName}
            </span>
          )}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="px-3 py-1.5 text-sm font-medium text-slate-700 hover:text-red-600 rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {loggingOut ? "Logging out..." : "Log out"}
          </button>
        </div>
      </div>
    </header>
  );
}
