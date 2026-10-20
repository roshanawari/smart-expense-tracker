import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Expense Tracker",
  description: "Track income, expenses, budgets, and savings goals.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F8FAFC] text-[#0F172A] antialiased">
        {children}
      </body>
    </html>
  );
}
