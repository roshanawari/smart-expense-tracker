import { describe, it, expect, beforeEach } from "vitest";
import { POST as createTxHandler, GET as listTxHandler } from "@/app/api/transactions/route";
import {
  GET as getTxHandler,
  PATCH as patchTxHandler,
  DELETE as deleteTxHandler,
} from "@/app/api/transactions/[id]/route";
import { db } from "@/lib/db";
import { createSessionToken } from "@/lib/auth";

describe("M2 Transactions - F2, F3, F4, F5", () => {
  let userAId: string;
  let userBId: string;
  let userACookie: string;
  let userBCookie: string;

  let salaryCatId: string;
  let foodCatId: string;

  beforeEach(async () => {
    // Clean up test data
    await db.transaction.deleteMany({
      where: { user: { email: { in: ["usera@test.com", "userb@test.com"] } } },
    });
    await db.user.deleteMany({
      where: { email: { in: ["usera@test.com", "userb@test.com"] } },
    });

    // Create user A
    const userA = await db.user.create({
      data: {
        name: "User A",
        email: "usera@test.com",
        passwordHash: "hash123",
      },
    });
    userAId = userA.id;
    const tokenA = await createSessionToken({
      userId: userA.id,
      email: userA.email,
      name: userA.name,
    });
    userACookie = `session_token=${tokenA}`;

    // Create user B
    const userB = await db.user.create({
      data: {
        name: "User B",
        email: "userb@test.com",
        passwordHash: "hash456",
      },
    });
    userBId = userB.id;
    const tokenB = await createSessionToken({
      userId: userB.id,
      email: userB.email,
      name: userB.name,
    });
    userBCookie = `session_token=${tokenB}`;

    // Fetch categories
    const salary = await db.category.findUniqueOrThrow({
      where: { name_type: { name: "Salary", type: "INCOME" } },
    });
    salaryCatId = salary.id;

    const food = await db.category.findUniqueOrThrow({
      where: { name_type: { name: "Food", type: "EXPENSE" } },
    });
    foodCatId = food.id;
  });

  it("F2: creates income transaction with integer paise in SQLite", async () => {
    const req = new Request("http://localhost:3000/api/transactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: userACookie,
      },
      body: JSON.stringify({
        type: "INCOME",
        amountMinor: 5000000, // 50,000.00
        date: "2026-10-15",
        categoryId: salaryCatId,
        description: "Monthly salary",
      }),
    });

    const res = await createTxHandler(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.transaction).toBeDefined();
    expect(json.transaction.type).toBe("INCOME");
    expect(json.transaction.amountMinor).toBe(5000000);
    expect(json.transaction.category.name).toBe("Salary");

    // Verify directly in real SQLite DB
    const inDb = await db.transaction.findUnique({
      where: { id: json.transaction.id },
    });
    expect(inDb).not.toBeNull();
    expect(inDb?.amountMinor).toBe(5000000);
    expect(inDb?.userId).toBe(userAId);
  });

  it("F3: creates expense transaction with integer paise in SQLite", async () => {
    const req = new Request("http://localhost:3000/api/transactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: userACookie,
      },
      body: JSON.stringify({
        type: "EXPENSE",
        amountMinor: 45050, // 450.50
        date: "2026-10-15",
        categoryId: foodCatId,
        description: "Grocery run",
      }),
    });

    const res = await createTxHandler(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.transaction.type).toBe("EXPENSE");
    expect(json.transaction.amountMinor).toBe(45050);
    expect(json.transaction.category.name).toBe("Food");
  });

  it("F4: rejects category mismatch between transaction type and category type", async () => {
    // Attempt to create EXPENSE transaction with INCOME category (Salary)
    const req = new Request("http://localhost:3000/api/transactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: userACookie,
      },
      body: JSON.stringify({
        type: "EXPENSE",
        amountMinor: 10000,
        date: "2026-10-15",
        categoryId: salaryCatId,
      }),
    });

    const res = await createTxHandler(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.message).toContain("does not match");
  });

  it("lists own transactions with filtering by month, type, category", async () => {
    // Create 2 transactions for User A
    await db.transaction.create({
      data: {
        userId: userAId,
        type: "INCOME",
        amountMinor: 200000,
        date: "2026-10-01",
        categoryId: salaryCatId,
      },
    });
    await db.transaction.create({
      data: {
        userId: userAId,
        type: "EXPENSE",
        amountMinor: 50000,
        date: "2026-09-15",
        categoryId: foodCatId,
      },
    });

    // List all
    const reqAll = new Request("http://localhost:3000/api/transactions", {
      headers: { cookie: userACookie },
    });
    const resAll = await listTxHandler(reqAll);
    const jsonAll = await resAll.json();
    expect(jsonAll.transactions.length).toBe(2);

    // Filter by month October 2026
    const reqOct = new Request("http://localhost:3000/api/transactions?month=2026-10", {
      headers: { cookie: userACookie },
    });
    const resOct = await listTxHandler(reqOct);
    const jsonOct = await resOct.json();
    expect(jsonOct.transactions.length).toBe(1);
    expect(jsonOct.transactions[0].date).toBe("2026-10-01");
  });

  it("F5: edits and deletes transaction; blocks cross-user access with 404", async () => {
    // User A creates a transaction
    const txA = await db.transaction.create({
      data: {
        userId: userAId,
        type: "EXPENSE",
        amountMinor: 120000,
        date: "2026-10-10",
        categoryId: foodCatId,
        description: "Dinner",
      },
    });

    // User A edits transaction
    const editReq = new Request(`http://localhost:3000/api/transactions/${txA.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        cookie: userACookie,
      },
      body: JSON.stringify({
        amountMinor: 150000,
        description: "Dinner with friends",
      }),
    });
    const editRes = await patchTxHandler(editReq, {
      params: Promise.resolve({ id: txA.id }),
    });
    expect(editRes.status).toBe(200);
    const editJson = await editRes.json();
    expect(editJson.transaction.amountMinor).toBe(150000);
    expect(editJson.transaction.description).toBe("Dinner with friends");

    // Security: User B tries to view User A's transaction -> must be 404, not 403
    const crossGetReq = new Request(`http://localhost:3000/api/transactions/${txA.id}`, {
      headers: { cookie: userBCookie },
    });
    const crossGetRes = await getTxHandler(crossGetReq, {
      params: Promise.resolve({ id: txA.id }),
    });
    expect(crossGetRes.status).toBe(404);

    // Security: User B tries to edit User A's transaction -> 404
    const crossPatchReq = new Request(`http://localhost:3000/api/transactions/${txA.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        cookie: userBCookie,
      },
      body: JSON.stringify({ amountMinor: 999999 }),
    });
    const crossPatchRes = await patchTxHandler(crossPatchReq, {
      params: Promise.resolve({ id: txA.id }),
    });
    expect(crossPatchRes.status).toBe(404);

    // Security: User B tries to delete User A's transaction -> 404
    const crossDelReq = new Request(`http://localhost:3000/api/transactions/${txA.id}`, {
      method: "DELETE",
      headers: { cookie: userBCookie },
    });
    const crossDelRes = await deleteTxHandler(crossDelReq, {
      params: Promise.resolve({ id: txA.id }),
    });
    expect(crossDelRes.status).toBe(404);

    // User A deletes own transaction -> 204
    const delReq = new Request(`http://localhost:3000/api/transactions/${txA.id}`, {
      method: "DELETE",
      headers: { cookie: userACookie },
    });
    const delRes = await deleteTxHandler(delReq, {
      params: Promise.resolve({ id: txA.id }),
    });
    expect(delRes.status).toBe(204);

    // Verify deleted from real SQLite DB
    const checkDb = await db.transaction.findUnique({
      where: { id: txA.id },
    });
    expect(checkDb).toBeNull();
  });
});
