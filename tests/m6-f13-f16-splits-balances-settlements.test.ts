import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { hashPassword, createSessionToken } from "@/lib/auth";
import { GET as getFriends } from "@/app/api/friends/route";
import { GET as getGroupDetail } from "@/app/api/groups/[id]/route";
import { POST as createExpense } from "@/app/api/expenses/route";
import { POST as createSettlement, GET as getSettlements } from "@/app/api/settlements/route";
import { NextRequest } from "next/server";

describe("Milestone 6: Features F13, F14, F15, F16 (Splits, Balances, Settlements, Ledger)", () => {
  let userA: any;
  let userB: any;
  let userC: any;
  let tokenA: string;
  let tokenB: string;
  let tokenC: string;
  let group: any;

  beforeEach(async () => {
    // Cleanup previous data
    const existing = await db.user.findMany({
      where: {
        email: { in: ["split_a@test.com", "split_b@test.com", "split_c@test.com"] },
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
      data: { name: "Alice Split", email: "split_a@test.com", passwordHash },
    });
    userB = await db.user.create({
      data: { name: "Bob Split", email: "split_b@test.com", passwordHash },
    });
    userC = await db.user.create({
      data: { name: "Charlie Split", email: "split_c@test.com", passwordHash },
    });

    tokenA = await createSessionToken({ userId: userA.id, email: userA.email, name: userA.name });
    tokenB = await createSessionToken({ userId: userB.id, email: userB.email, name: userB.name });
    tokenC = await createSessionToken({ userId: userC.id, email: userC.email, name: userC.name });

    // Establish mutual friendships between all three
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
        name: "Goa Vacation",
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

  it("F13: Equal 100.00 among 3 saves shares 33.34 / 33.33 / 33.33; Percent and Exact validation", async () => {
    // 1. Equal split 100.00 (10000 paise) among A, B, C
    const equalReq = new NextRequest("http://localhost:3000/api/expenses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `session_token=${tokenA}`,
      },
      body: JSON.stringify({
        groupId: group.id,
        description: "Dinner",
        total: "100.00",
        date: "2026-10-11",
        paidById: userA.id,
        splitMethod: "EQUAL",
        participantIds: [userA.id, userB.id, userC.id],
      }),
    });

    const equalRes = await createExpense(equalReq);
    expect(equalRes.status).toBe(201);
    const equalData = await equalRes.json();
    const shares = equalData.expense.shares;
    expect(shares.length).toBe(3);

    // Total paise is exactly 10000
    const sumPaise = shares.reduce((acc: number, s: any) => acc + s.shareMinor, 0);
    expect(sumPaise).toBe(10000);

    // Extra paise goes to first participant in fixed order
    expect(shares[0].shareMinor).toBe(3334);
    expect(shares[1].shareMinor).toBe(3333);
    expect(shares[2].shareMinor).toBe(3333);

    // 2. Percent split validation: fails if not 100%
    const badPercentReq = new NextRequest("http://localhost:3000/api/expenses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `session_token=${tokenA}`,
      },
      body: JSON.stringify({
        groupId: group.id,
        description: "Snacks",
        total: "100.00",
        date: "2026-10-11",
        paidById: userA.id,
        splitMethod: "PERCENT",
        shares: [
          { userId: userA.id, percent: 50 },
          { userId: userB.id, percent: 40 }, // sums to 90%, not 100%
        ],
      }),
    });
    const badPercentRes = await createExpense(badPercentReq);
    expect(badPercentRes.status).toBe(400);
    const badPercentData = await badPercentRes.json();
    expect(badPercentData.error.code).toBe("INVALID_SPLIT");

    // 3. Exact split validation: fails if not matching total
    const badExactReq = new NextRequest("http://localhost:3000/api/expenses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `session_token=${tokenA}`,
      },
      body: JSON.stringify({
        groupId: group.id,
        description: "Cab",
        total: "100.00",
        date: "2026-10-11",
        paidById: userA.id,
        splitMethod: "EXACT",
        shares: [
          { userId: userA.id, exactMinor: 5000 },
          { userId: userB.id, exactMinor: 4000 }, // sums to 9000, not 10000
        ],
      }),
    });
    const badExactRes = await createExpense(badExactReq);
    expect(badExactRes.status).toBe(400);
    const badExactData = await badExactRes.json();
    expect(badExactData.error.code).toBe("INVALID_SPLIT");
  });

  it("F14: If A paid 90.00 split equally with B and C, B and C each owe A 30.00 on the group page and on /friends", async () => {
    // Alice pays 90.00 (9000 paise) split equally with A, B, C
    const req = new NextRequest("http://localhost:3000/api/expenses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `session_token=${tokenA}`,
      },
      body: JSON.stringify({
        groupId: group.id,
        description: "Resort Stay",
        total: "90.00",
        date: "2026-10-11",
        paidById: userA.id,
        splitMethod: "EQUAL",
        participantIds: [userA.id, userB.id, userC.id],
      }),
    });
    const res = await createExpense(req);
    expect(res.status).toBe(201);

    // 1. Check Group details from Bob's perspective
    const bGroupReq = new NextRequest(`http://localhost:3000/api/groups/${group.id}`, {
      headers: { cookie: `session_token=${tokenB}` },
    });
    const bGroupRes = await getGroupDetail(bGroupReq, {
      params: Promise.resolve({ id: group.id }),
    });
    expect(bGroupRes.status).toBe(200);
    const bGroupData = await bGroupRes.json();

    // In group: A has balance +6000 (creditor), B has -3000 (debtor), C has -3000 (debtor)
    const memberA = bGroupData.members.find((m: any) => m.id === userA.id);
    const memberB = bGroupData.members.find((m: any) => m.id === userB.id);
    const memberC = bGroupData.members.find((m: any) => m.id === userC.id);
    expect(memberA.balanceMinor).toBe(6000);
    expect(memberB.balanceMinor).toBe(-3000);
    expect(memberC.balanceMinor).toBe(-3000);
    expect(bGroupData.userBalanceMinor).toBe(-3000);

    // 2. Check /friends from Bob's perspective: owes Alice 30.00 (-3000)
    const bFriendsReq = new NextRequest("http://localhost:3000/api/friends", {
      headers: { cookie: `session_token=${tokenB}` },
    });
    const bFriendsRes = await getFriends(bFriendsReq);
    expect(bFriendsRes.status).toBe(200);
    const bFriendsData = await bFriendsRes.json();
    const aliceForBob = bFriendsData.friends.find((f: any) => f.id === userA.id);
    expect(aliceForBob.balanceMinor).toBe(-3000); // Bob owes Alice 30.00

    // 3. Check /friends from Alice's perspective: Bob owes Alice 30.00 (+3000), Charlie owes Alice 30.00 (+3000)
    const aFriendsReq = new NextRequest("http://localhost:3000/api/friends", {
      headers: { cookie: `session_token=${tokenA}` },
    });
    const aFriendsRes = await getFriends(aFriendsReq);
    expect(aFriendsRes.status).toBe(200);
    const aFriendsData = await aFriendsRes.json();
    const bobForAlice = aFriendsData.friends.find((f: any) => f.id === userB.id);
    const charlieForAlice = aFriendsData.friends.find((f: any) => f.id === userC.id);
    expect(bobForAlice.balanceMinor).toBe(3000);
    expect(charlieForAlice.balanceMinor).toBe(3000);
  });

  it("F15: B records paying A 30.00; B's balance with A becomes 0.00 and payment appears in /history", async () => {
    // Setup expense: Alice pays 90.00 split equally among A, B, C
    await createExpense(
      new NextRequest("http://localhost:3000/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `session_token=${tokenA}`,
        },
        body: JSON.stringify({
          groupId: group.id,
          description: "Lunch",
          total: "90.00",
          date: "2026-10-11",
          paidById: userA.id,
          splitMethod: "EQUAL",
          participantIds: [userA.id, userB.id, userC.id],
        }),
      })
    );

    // Bob records paying Alice 30.00 (3000 paise) in the group
    const settleReq = new NextRequest("http://localhost:3000/api/settlements", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `session_token=${tokenB}`,
      },
      body: JSON.stringify({
        groupId: group.id,
        fromUserId: userB.id,
        toUserId: userA.id,
        amountMinor: 3000,
        date: "2026-10-11",
        note: "Settled lunch share",
      }),
    });
    const settleRes = await createSettlement(settleReq);
    expect(settleRes.status).toBe(201);
    const settleData = await settleRes.json();
    expect(settleData.settlement.amountMinor).toBe(3000);

    // Check Bob's balance with Alice on /friends is now 0.00
    const bFriendsReq = new NextRequest("http://localhost:3000/api/friends", {
      headers: { cookie: `session_token=${tokenB}` },
    });
    const bFriendsRes = await getFriends(bFriendsReq);
    const bFriendsData = await bFriendsRes.json();
    const aliceForBob = bFriendsData.friends.find((f: any) => f.id === userA.id);
    expect(aliceForBob.balanceMinor).toBe(0);

    // Check payment appears in /history (GET /api/settlements)
    const historyReq = new NextRequest("http://localhost:3000/api/settlements", {
      headers: { cookie: `session_token=${tokenB}` },
    });
    const historyRes = await getSettlements(historyReq);
    expect(historyRes.status).toBe(200);
    const historyData = await historyRes.json();
    expect(historyData.settlements.length).toBeGreaterThanOrEqual(1);

    const payment = historyData.settlements.find(
      (s: any) => s.id === settleData.settlement.id
    );
    expect(payment).toBeDefined();
    expect(payment.fromUser.id).toBe(userB.id);
    expect(payment.toUser.id).toBe(userA.id);
    expect(payment.amountMinor).toBe(3000);
    expect(payment.date).toBe("2026-10-11");
    expect(payment.group.id).toBe(group.id);
  });
});
