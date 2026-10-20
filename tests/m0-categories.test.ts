import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/categories/route";
import { db } from "@/lib/db";

describe("M0 Skeleton - Categories API and Real Database", () => {
  it("reads the 8 seeded categories directly from SQLite database", async () => {
    const categoriesInDb = await db.category.findMany();
    expect(categoriesInDb.length).toBe(8);

    const expenseNames = categoriesInDb
      .filter((c) => c.type === "EXPENSE")
      .map((c) => c.name)
      .sort();
    const incomeNames = categoriesInDb
      .filter((c) => c.type === "INCOME")
      .map((c) => c.name)
      .sort();

    expect(expenseNames).toEqual(["Bills", "Food", "Other", "Shopping", "Travel"]);
    expect(incomeNames).toEqual(["Other income", "Pocket money", "Salary"]);
  });

  it("GET /api/categories returns 200 with the 8 categories", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.categories).toBeDefined();
    expect(Array.isArray(json.categories)).toBe(true);
    expect(json.categories.length).toBe(8);

    const expenseCats = json.categories.filter((c: { type: string }) => c.type === "EXPENSE");
    const incomeCats = json.categories.filter((c: { type: string }) => c.type === "INCOME");

    expect(expenseCats.length).toBe(5);
    expect(incomeCats.length).toBe(3);
  });
});
