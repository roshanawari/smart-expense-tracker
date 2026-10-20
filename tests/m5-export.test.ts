import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { hashPassword, createSessionToken } from "@/lib/auth";
import { GET as exportHandler } from "@/app/api/transactions/export/route";
import { escapeCsvCell, generateCsv, ExportTransaction } from "@/lib/csv";
import { generatePdf } from "@/lib/pdf";
import { NextRequest } from "next/server";

describe("Milestone 5: Reports and Export (Feature F10)", () => {
  let testUserId: string;
  let testSessionToken: string;
  let foodCategory: any;
  let salaryCategory: any;

  beforeEach(async () => {
    // Clean up test user
    const existing = await db.user.findUnique({
      where: { email: "export_tester@example.com" },
    });
    if (existing) {
      await db.transaction.deleteMany({ where: { userId: existing.id } });
      await db.user.delete({ where: { id: existing.id } });
    }

    const passwordHash = await hashPassword("password123");
    const user = await db.user.create({
      data: {
        name: "Export Tester",
        email: "export_tester@example.com",
        passwordHash,
      },
    });

    testUserId = user.id;
    testSessionToken = await createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
    });

    foodCategory = await db.category.findUniqueOrThrow({
      where: { name_type: { name: "Food", type: "EXPENSE" } },
    });
    salaryCategory = await db.category.findUniqueOrThrow({
      where: { name_type: { name: "Salary", type: "INCOME" } },
    });
  });

  describe("CSV Helper Unit Tests", () => {
    it("escapes special characters and protects against spreadsheet formula injection", () => {
      // Formula characters: =, +, -, @
      expect(escapeCsvCell("=SUM(A1:B1)")).toBe("'=SUM(A1:B1)");
      expect(escapeCsvCell("+1234")).toBe("'+1234");
      expect(escapeCsvCell("-5678")).toBe("'-5678");
      expect(escapeCsvCell("@admin")).toBe("'@admin");

      // Commas and quotes
      expect(escapeCsvCell("Lunch, Coffee")).toBe('"Lunch, Coffee"');
      expect(escapeCsvCell('He said "Hello"')).toBe('"He said ""Hello"""');
      expect(escapeCsvCell("Simple text")).toBe("Simple text");
    });

    it("generates correctly formatted CSV lines with major units and 2 decimals", () => {
      const sample: ExportTransaction[] = [
        {
          date: "2026-10-01",
          type: "INCOME",
          categoryName: "Salary",
          description: "Monthly salary",
          amountMinor: 5000000, // ₹50,000.00
        },
        {
          date: "2026-10-05",
          type: "EXPENSE",
          categoryName: "Food",
          description: "=DANGEROUS FORMULA",
          amountMinor: 25050, // ₹250.50
        },
      ];

      const csv = generateCsv(sample);
      const lines = csv.split("\n");
      expect(lines[0]).toBe("date,type,category,description,amount");
      expect(lines[1]).toBe("2026-10-01,INCOME,Salary,Monthly salary,50000.00");
      expect(lines[2]).toBe("2026-10-05,EXPENSE,Food,'=DANGEROUS FORMULA,250.50");
    });
  });

  describe("GET /api/transactions/export Route", () => {
    it("returns 401 when unauthenticated", async () => {
      const req = new NextRequest("http://localhost:3000/api/transactions/export?format=csv");
      const res = await exportHandler(req);
      expect(res.status).toBe(401);
    });

    it("returns 400 when format is invalid or missing", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/transactions/export?format=xlsx",
        {
          headers: { cookie: `session_token=${testSessionToken}` },
        }
      );
      const res = await exportHandler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("INVALID_FORMAT");
    });

    it("exports CSV filtered to a month with exact rows, headers, and formula safety", async () => {
      // Create transactions
      await db.transaction.create({
        data: {
          userId: testUserId,
          categoryId: salaryCategory.id,
          type: "INCOME",
          amountMinor: 7500000, // ₹75,000.00
          date: "2026-10-01",
          description: "Main salary",
        },
      });

      await db.transaction.create({
        data: {
          userId: testUserId,
          categoryId: foodCategory.id,
          type: "EXPENSE",
          amountMinor: 125000, // ₹1,250.00
          date: "2026-10-15",
          description: "Dinner, drinks & snacks",
        },
      });

      // Another month's transaction should be filtered out
      await db.transaction.create({
        data: {
          userId: testUserId,
          categoryId: foodCategory.id,
          type: "EXPENSE",
          amountMinor: 9900,
          date: "2026-09-20",
          description: "September snacks",
        },
      });

      const req = new NextRequest(
        "http://localhost:3000/api/transactions/export?format=csv&month=2026-10",
        {
          headers: { cookie: `session_token=${testSessionToken}` },
        }
      );
      const res = await exportHandler(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/csv");
      expect(res.headers.get("Content-Disposition")).toContain('filename="transactions-2026-10.csv"');

      const csvText = await res.text();
      const lines = csvText.trim().split("\n");
      expect(lines.length).toBe(3); // header + 2 transactions
      expect(lines[0]).toBe("date,type,category,description,amount");
      expect(csvText).toContain("Dinner, drinks & snacks");
      expect(csvText).toContain("75000.00");
      expect(csvText).toContain("1250.00");
      expect(csvText).not.toContain("September snacks");
    });

    it("exports PDF with valid PDF binary buffer containing %PDF- magic header", async () => {
      await db.transaction.create({
        data: {
          userId: testUserId,
          categoryId: salaryCategory.id,
          type: "INCOME",
          amountMinor: 4000000,
          date: "2026-10-02",
          description: "Consulting",
        },
      });

      const req = new NextRequest(
        "http://localhost:3000/api/transactions/export?format=pdf&month=2026-10",
        {
          headers: { cookie: `session_token=${testSessionToken}` },
        }
      );
      const res = await exportHandler(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/pdf");
      expect(res.headers.get("Content-Disposition")).toContain('filename="transactions-2026-10.pdf"');

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      // Valid PDF files start with %PDF-
      expect(buffer.toString("utf-8", 0, 5)).toBe("%PDF-");
      expect(buffer.length).toBeGreaterThan(100);
    });

    it("generates PDF via generatePdf helper successfully without crashing", async () => {
      const pdf = await generatePdf({
        periodLabel: "October 2026",
        transactions: [
          {
            date: "2026-10-10",
            type: "EXPENSE",
            categoryName: "Food",
            description: "Groceries",
            amountMinor: 350000,
          },
        ],
        totalIncomeMinor: 0,
        totalExpensesMinor: 350000,
        netBalanceMinor: -350000,
      });

      expect(Buffer.isBuffer(pdf)).toBe(true);
      expect(pdf.toString("utf-8", 0, 5)).toBe("%PDF-");
    });
  });
});
