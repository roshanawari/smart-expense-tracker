import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { hashPassword, createSessionToken } from "@/lib/auth";
import { GET as getSimplify } from "@/app/api/groups/[id]/simplify/route";
import { GET as getGroupDetail } from "@/app/api/groups/[id]/route";
import { POST as createExpense } from "@/app/api/expenses/route";
import { POST as createSettlement } from "@/app/api/settlements/route";
import { NextRequest } from "next/server";

describe("Milestone 7: Feature F17 (Debt Simplification API & Flow)", () => {
  let userA: any;
  let userB: any;
  let userC: any;
  let userD: any;
  let tokenA: string;
  let tokenB: string;
  let tokenD: string;
  let group: any;

  beforeEach(async () => {
    // Cleanup previous data
    const existing = await db.user.findMany({
      where: {
        email: {
          in: ["sim_a@test.com", "sim_b@test.com", "sim_c@test.com", "sim_non@test.com"],
        },
      },
    });
    const ids = existing.map((u) => u.id);
    if (ids.length > 0) {
      await db.expenseShare.deleteMany({ where: { userId: { in: ids } } });
      await db.settlement.deleteMany({
        where: { OR: [{ fromUserId: { in: ids } }, { toUserId: { in: ids } }] },
      });
      await db.sharedExpense.deleteMany({
        where: { OR: [{ createdById: { in: ids } }, { paidById: { in: ids } }] },
      });
      await db.groupMember.deleteMany({ where: { userId: { in: ids } } });
      await db.group.deleteMany({ where: { createdById: { in: ids } } });
      await db.friendship.deleteMany({
        where: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] },
      });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }

    const passwordHash = await hashPassword("password123");
    userA = await db.user.create({
      data: { name: "Alice Simplify", email: "sim_a@test.com", passwordHash },
    });
    userB = await db.user.create({
      data: { name: "Bob Simplify", email: "sim_b@test.com", passwordHash },
    });
    userC = await db.user.create({
      data: { name: "Charlie Simplify", email: "sim_c@test.com", passwordHash },
    });
    userD = await db.user.create({
      data: { name: "Dennis NonMember", email: "sim_non@test.com", passwordHash },
    });

    tokenA = await createSessionToken({ userId: userA.id, email: userA.email, name: userA.name });
    tokenB = await createSessionToken({ userId: userB.id, email: userB.email, name: userB.name });
    tokenD = await createSessionToken({ userId: userD.id, email: userD.email, name: userD.name });

    // Establish mutual friendships
    await db.friendship.createMany({
      data: [
        { userAId: userA.id, userBId: userB.id },
        { userAId: userA.id, userBId: userC.id },
        { userAId: userB.id, userBId: userC.id },
      ],
    });

    // Create group with A, B, C
    group = await db.group.create({
      data: {
        name: "Simplify Group",
        createdById: userA.id,
        members: {
          create: [
            { userId: userA.id },
            { userId: userB.id },
            { userId: userC.id },
          ],
        },
      },
    });
  });

  it("Non-member opening GET /api/groups/:id/simplify gets 404", async () => {
    const req = new NextRequest(`http://localhost:3000/api/groups/${group.id}/simplify`, {
      headers: { cookie: `session_token=${tokenD}` },
    });
    const res = await getSimplify(req, { params: Promise.resolve({ id: group.id }) });
    expect(res.status).toBe(404);
  });

  it("F17 Done when: A paid for B and C, and B paid for C, shows fewer or equal suggested payments than raw debts, and recording all brings balances to 0.00", async () => {
    // 1. A paid 60.00 for A, B, C (20.00 each)
    await createExpense(
      new NextRequest("http://localhost:3000/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `session_token=${tokenA}`,
        },
        body: JSON.stringify({
          groupId: group.id,
          description: "Fancy Dinner",
          total: "60.00",
          date: "2026-10-11",
          paidById: userA.id,
          splitMethod: "EQUAL",
          participantIds: [userA.id, userB.id, userC.id],
        }),
      })
    );

    // 2. B paid 30.00 for B and C (15.00 each)
    await createExpense(
      new NextRequest("http://localhost:3000/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `session_token=${tokenB}`,
        },
        body: JSON.stringify({
          groupId: group.id,
          description: "Night Cab",
          total: "30.00",
          date: "2026-10-11",
          paidById: userB.id,
          splitMethod: "EQUAL",
          participantIds: [userB.id, userC.id],
        }),
      })
    );

    // 3. Request simplification
    const req = new NextRequest(`http://localhost:3000/api/groups/${group.id}/simplify`, {
      headers: { cookie: `session_token=${tokenB}` },
    });
    const res = await getSimplify(req, { params: Promise.resolve({ id: group.id }) });
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.rawDebtCount).toBe(3);
    expect(data.simplifiedCount).toBe(2);
    expect(data.simplifiedCount).toBeLessThan(data.rawDebtCount);
    expect(data.simplifiedPayments.length).toBe(2);

    // 4. Record the suggested simplified payments
    for (const p of data.simplifiedPayments) {
      const payerToken = p.fromUserId === userB.id ? tokenB : tokenA;
      const settleRes = await createSettlement(
        new NextRequest("http://localhost:3000/api/settlements", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: `session_token=${payerToken}`,
          },
          body: JSON.stringify({
            groupId: group.id,
            fromUserId: p.fromUserId,
            toUserId: p.toUserId,
            amountMinor: p.amountMinor,
            date: "2026-10-11",
            note: "Simplified debt payment",
          }),
        })
      );
      expect(settleRes.status).toBe(201);
    }

    // 5. Check group balances: all members now have balance 0.00
    const detailReq = new NextRequest(`http://localhost:3000/api/groups/${group.id}`, {
      headers: { cookie: `session_token=${tokenA}` },
    });
    const detailRes = await getGroupDetail(detailReq, {
      params: Promise.resolve({ id: group.id }),
    });
    const detailData = await detailRes.json();
    for (const m of detailData.members) {
      expect(m.balanceMinor).toBe(0);
    }
    expect(detailData.userBalanceMinor).toBe(0);
  });
});
