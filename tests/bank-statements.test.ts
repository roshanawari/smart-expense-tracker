import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { hashPassword, createSessionToken } from "@/lib/auth";
import { POST as analyzeStatement } from "@/app/api/statements/analyze/route";
import { POST as importStatement } from "@/app/api/statements/import/route";
import { NextRequest } from "next/server";

describe("Monthly Bank Statement Analyzer Feature", () => {
  let user: any;
  let token: string;
  let foodCategory: any;
  let salaryCategory: any;

  beforeEach(async () => {
    const existing = await db.user.findFirst({
      where: { email: "statement_user@test.com" },
    });
    if (existing) {
      await db.user.delete({ where: { id: existing.id } });
    }

    const passwordHash = await hashPassword("password123");
    user = await db.user.create({
      data: {
        name: "Statement User",
        email: "statement_user@test.com",
        passwordHash,
      },
    });
    token = await createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    foodCategory = await db.category.findFirst({
      where: { name: "Food", type: "EXPENSE" },
    });
    salaryCategory = await db.category.findFirst({
      where: { name: "Salary", type: "INCOME" },
    });
  });

  describe("POST /api/statements/analyze", () => {
    it("Rejects unauthenticated requests with 401", async () => {
      const formData = new FormData();
      const req = new NextRequest("http://localhost:3000/api/statements/analyze", {
        method: "POST",
        body: formData,
      });
      const res = await analyzeStatement(req);
      expect(res.status).toBe(401);
    });

    it("Rejects request when no file is uploaded with 400", async () => {
      const formData = new FormData();
      const req = new NextRequest("http://localhost:3000/api/statements/analyze", {
        method: "POST",
        headers: { cookie: `session_token=${token}` },
        body: formData,
      });
      const res = await analyzeStatement(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("STATEMENT_FAILED");
    });

    it("Rejects files larger than 10MB with FILE_TOO_LARGE", async () => {
      const largeBuffer = new Uint8Array(10.5 * 1024 * 1024);
      const blob = new Blob([largeBuffer], { type: "application/pdf" });
      const formData = new FormData();
      formData.append("statement", blob, "large_statement.pdf");

      const req = new NextRequest("http://localhost:3000/api/statements/analyze", {
        method: "POST",
        headers: { cookie: `session_token=${token}` },
        body: formData,
      });
      const res = await analyzeStatement(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("FILE_TOO_LARGE");
    });

    it(
      "Successfully analyzes a bank statement CSV and returns structured transactions",
      async () => {
        const sampleCsv = `Date,Description,Debit,Credit,Balance
2026-10-01,UPI Swiggy Foods,450.00,,45500.00
2026-10-03,Monthly Salary Credit,,65000.00,110500.00
`;
        const blob = new Blob([sampleCsv], { type: "text/csv" });
        const formData = new FormData();
        formData.append("statement", blob, "statement.csv");

        const req = new NextRequest("http://localhost:3000/api/statements/analyze", {
          method: "POST",
          headers: { cookie: `session_token=${token}` },
          body: formData,
        });

        const res = await analyzeStatement(req);
        expect(res.status).toBe(200);
        const data = await res.json();

        expect(data.bankName).toBeDefined();
        expect(data.summary).toBeDefined();
        expect(data.transactions).toBeInstanceOf(Array);
        expect(data.transactions.length).toBeGreaterThanOrEqual(1);

        const firstTx = data.transactions[0];
        expect(firstTx.tempId).toBeDefined();
        expect(firstTx.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(firstTx.amountMinor).toBeGreaterThan(0);
        expect(firstTx.categoryId).toBeDefined();
      },
      45000
    );
  });

  describe("POST /api/statements/import", () => {
    it("Rejects unauthenticated requests with 401", async () => {
      const req = new NextRequest("http://localhost:3000/api/statements/import", {
        method: "POST",
        body: JSON.stringify({ transactions: [] }),
      });
      const res = await importStatement(req);
      expect(res.status).toBe(401);
    });

    it("Rejects empty transactions array with 400", async () => {
      const req = new NextRequest("http://localhost:3000/api/statements/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `session_token=${token}`,
        },
        body: JSON.stringify({ transactions: [] }),
      });
      const res = await importStatement(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("BAD_REQUEST");
    });

    it("Successfully imports selected transactions into the user's database", async () => {
      expect(foodCategory).toBeDefined();
      expect(salaryCategory).toBeDefined();

      const toImport = [
        {
          date: "2026-10-01",
          description: "Swiggy Dinner",
          type: "EXPENSE",
          amountMinor: 45000,
          categoryId: foodCategory.id,
        },
        {
          date: "2026-10-03",
          description: "Tech Corp Salary",
          type: "INCOME",
          amountMinor: 6500000,
          categoryId: salaryCategory.id,
        },
      ];

      const req = new NextRequest("http://localhost:3000/api/statements/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `session_token=${token}`,
        },
        body: JSON.stringify({ transactions: toImport }),
      });

      const res = await importStatement(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.count).toBe(2);

      // Verify in DB
      const userTransactions = await db.transaction.findMany({
        where: { userId: user.id },
        orderBy: { date: "asc" },
      });
      expect(userTransactions.length).toBe(2);
      expect(userTransactions[0].description).toBe("Swiggy Dinner");
      expect(userTransactions[0].amountMinor).toBe(45000);
      expect(userTransactions[0].type).toBe("EXPENSE");
      expect(userTransactions[1].description).toBe("Tech Corp Salary");
      expect(userTransactions[1].amountMinor).toBe(6500000);
      expect(userTransactions[1].type).toBe("INCOME");
    });
  });
});
