import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword, createSessionToken } from "@/lib/auth";
import { GET as getDashboard } from "@/app/api/dashboard/route";
import { NextRequest } from "next/server";
import {
  isValidYearMonth,
  getMonthRange,
  getPreviousMonth,
  getNextMonth,
  getLastNMonths,
} from "@/lib/date";

describe("Milestone 3: Dashboard (Features F6 & F7)", () => {
  let testUserId: string;
  let testSessionToken: string;
  let foodCategory: any;
  let salaryCategory: any;

  beforeEach(async () => {
    // Clean up dashboard test user data
    const existing = await prisma.user.findUnique({
      where: { email: "dashboard@example.com" },
    });
    if (existing) {
      await prisma.transaction.deleteMany({ where: { userId: existing.id } });
      await prisma.budget.deleteMany({ where: { userId: existing.id } });
      await prisma.savingsGoal.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }

    // Create test user
    const passwordHash = await hashPassword("password123");
    const user = await prisma.user.create({
      data: {
        name: "Dashboard Tester",
        email: "dashboard@example.com",
        passwordHash,
        monthlyBudgetMinor: 1000000, // ₹10,000.00
      },
    });
    testUserId = user.id;
    testSessionToken = await createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    foodCategory = await prisma.category.findUniqueOrThrow({
      where: { name_type: { name: "Food", type: "EXPENSE" } },
    });
    salaryCategory = await prisma.category.findUniqueOrThrow({
      where: { name_type: { name: "Salary", type: "INCOME" } },
    });
  });

  describe("Date utilities", () => {
    it("validates year-month strings correctly", () => {
      expect(isValidYearMonth("2026-10")).toBe(true);
      expect(isValidYearMonth("2026-01")).toBe(true);
      expect(isValidYearMonth("2026-12")).toBe(true);
      expect(isValidYearMonth("2026-13")).toBe(false);
      expect(isValidYearMonth("2026-00")).toBe(false);
      expect(isValidYearMonth("202610")).toBe(false);
      expect(isValidYearMonth("invalid")).toBe(false);
    });

    it("calculates month boundaries and previous/next navigation", () => {
      const range = getMonthRange("2026-02");
      expect(range.start).toBe("2026-02-01");
      expect(range.end).toBe("2026-02-28");

      expect(getPreviousMonth("2026-01")).toBe("2025-12");
      expect(getNextMonth("2025-12")).toBe("2026-01");
      expect(getPreviousMonth("2026-10")).toBe("2026-09");
      expect(getNextMonth("2026-10")).toBe("2026-11");
    });

    it("generates exactly last 6 months ending at target month", () => {
      const periods = getLastNMonths("2026-10", 6);
      expect(periods.length).toBe(6);
      expect(periods[periods.length - 1].month).toBe("2026-10");
      expect(periods[0].month).toBe("2026-05");
    });
  });

  describe("GET /api/dashboard endpoint", () => {
    it("returns 401 when unauthenticated", async () => {
      const req = new NextRequest("http://localhost:3000/api/dashboard?month=2026-10");
      const res = await getDashboard(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 400 when month format is invalid", async () => {
      const req = new NextRequest("http://localhost:3000/api/dashboard?month=invalid-date", {
        headers: { cookie: `session_token=${testSessionToken}` },
      });
      const res = await getDashboard(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("INVALID_MONTH");
    });

    it("returns zero totals when user has no transactions for the month", async () => {
      const req = new NextRequest("http://localhost:3000/api/dashboard?month=2026-10", {
        headers: { cookie: `session_token=${testSessionToken}` },
      });
      const res = await getDashboard(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.totals.incomeMinor).toBe(0);
      expect(json.totals.expensesMinor).toBe(0);
      expect(json.totals.balanceMinor).toBe(0);
      expect(json.expensesByCategory).toEqual([]);
      expect(json.last6Months.length).toBe(6);
      expect(json.budget.monthlyBudgetMinor).toBe(1000000);
      expect(json.budget.isOverBudget).toBe(false);
    });

    it("calculates accurate income, expenses, balance, category spend, and budget status", async () => {
      // Create transactions in 2026-10
      await prisma.transaction.create({
        data: {
          userId: testUserId,
          categoryId: salaryCategory.id,
          type: "INCOME",
          amountMinor: 6000000, // ₹60,000.00
          date: "2026-10-01",
          description: "Monthly salary",
        },
      });

      await prisma.transaction.create({
        data: {
          userId: testUserId,
          categoryId: foodCategory.id,
          type: "EXPENSE",
          amountMinor: 250000, // ₹2,500.00
          date: "2026-10-15",
          description: "Groceries",
        },
      });

      // Also create a transaction in 2026-09 to test month isolation
      await prisma.transaction.create({
        data: {
          userId: testUserId,
          categoryId: foodCategory.id,
          type: "EXPENSE",
          amountMinor: 500000, // ₹5,000.00
          date: "2026-09-10",
          description: "Previous month groceries",
        },
      });

      const req = new NextRequest("http://localhost:3000/api/dashboard?month=2026-10", {
        headers: { cookie: `session_token=${testSessionToken}` },
      });
      const res = await getDashboard(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      // F6 Totals check
      expect(json.totals.incomeMinor).toBe(6000000);
      expect(json.totals.expensesMinor).toBe(250000);
      expect(json.totals.balanceMinor).toBe(5750000);

      // F7 Category breakdown check
      expect(json.expensesByCategory.length).toBe(1);
      expect(json.expensesByCategory[0].categoryName).toBe("Food");
      expect(json.expensesByCategory[0].amountMinor).toBe(250000);
      expect(json.expensesByCategory[0].percentage).toBe(100);

      // F7 6-Month breakdown check
      const sep = json.last6Months.find((m: any) => m.month === "2026-09");
      const oct = json.last6Months.find((m: any) => m.month === "2026-10");
      expect(sep).toBeDefined();
      expect(sep.expensesMinor).toBe(500000);
      expect(oct).toBeDefined();
      expect(oct.expensesMinor).toBe(250000);
      expect(oct.incomeMinor).toBe(6000000);

      // Budget check: 250000 spent out of 1000000
      expect(json.budget.monthlyBudgetMinor).toBe(1000000);
      expect(json.budget.budgetSpentMinor).toBe(250000);
      expect(json.budget.budgetRemainingMinor).toBe(750000);
      expect(json.budget.isOverBudget).toBe(false);
    });

    it("correctly flags isOverBudget when spending exceeds budget", async () => {
      // Set budget to ₹1,000.00 (100000 minor) and spend ₹1,500.00 (150000 minor)
      await prisma.user.update({
        where: { id: testUserId },
        data: { monthlyBudgetMinor: 100000 },
      });

      await prisma.transaction.create({
        data: {
          userId: testUserId,
          categoryId: foodCategory.id,
          type: "EXPENSE",
          amountMinor: 150000,
          date: "2026-10-10",
        },
      });

      const req = new NextRequest("http://localhost:3000/api/dashboard?month=2026-10", {
        headers: { cookie: `session_token=${testSessionToken}` },
      });
      const res = await getDashboard(req);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.budget.monthlyBudgetMinor).toBe(100000);
      expect(json.budget.budgetSpentMinor).toBe(150000);
      expect(json.budget.isOverBudget).toBe(true);
      expect(json.budget.budgetRemainingMinor).toBe(-50000);
    });
  });
});
