import { describe, it, expect } from "vitest";
import { simplifyDebts } from "@/lib/simplify";
import { SharedExpenseRecord, SettlementRecord, computeGroupNetBalances } from "@/lib/ledger";

describe("Milestone 7: Feature F17 - Debt Simplification (lib/simplify.ts)", () => {
  it("3-person cycle (A owes B, B owes C, C owes A equally) yields zero payments", () => {
    const memberIds = ["userA", "userB", "userC"];

    // B paid 30.00 for A (A owes B 30.00)
    // C paid 30.00 for B (B owes C 30.00)
    // A paid 30.00 for C (C owes A 30.00)
    const expenses: SharedExpenseRecord[] = [
      {
        id: "exp1",
        groupId: "g1",
        paidById: "userB",
        totalMinor: 3000,
        description: "B paid for A",
        date: "2026-10-11",
        shares: [{ userId: "userA", shareMinor: 3000 }],
      },
      {
        id: "exp2",
        groupId: "g1",
        paidById: "userC",
        totalMinor: 3000,
        description: "C paid for B",
        date: "2026-10-11",
        shares: [{ userId: "userB", shareMinor: 3000 }],
      },
      {
        id: "exp3",
        groupId: "g1",
        paidById: "userA",
        totalMinor: 3000,
        description: "A paid for C",
        date: "2026-10-11",
        shares: [{ userId: "userC", shareMinor: 3000 }],
      },
    ];

    const settlements: SettlementRecord[] = [];

    // Sum of net balances must be 0
    const netBalances = computeGroupNetBalances(memberIds, expenses, settlements);
    const sumNet = Object.values(netBalances).reduce((a, b) => a + b, 0);
    expect(sumNet).toBe(0);
    expect(netBalances["userA"]).toBe(0);
    expect(netBalances["userB"]).toBe(0);
    expect(netBalances["userC"]).toBe(0);

    const result = simplifyDebts(memberIds, expenses, settlements);
    // 3-person cycle simplifies to 0 payments!
    expect(result.simplifiedPayments.length).toBe(0);
    expect(result.simplifiedCount).toBe(0);
  });

  it("4 people gives 3 payments or fewer; sum of all net balances is exactly 0", () => {
    const memberIds = ["u1", "u2", "u3", "u4"];

    // Arbitrary complex expenses among 4 people
    const expenses: SharedExpenseRecord[] = [
      {
        id: "exp1",
        groupId: "g1",
        paidById: "u1",
        totalMinor: 4000,
        description: "Lunch",
        date: "2026-10-11",
        shares: [
          { userId: "u1", shareMinor: 1000 },
          { userId: "u2", shareMinor: 1000 },
          { userId: "u3", shareMinor: 1000 },
          { userId: "u4", shareMinor: 1000 },
        ],
      },
      {
        id: "exp2",
        groupId: "g1",
        paidById: "u2",
        totalMinor: 2000,
        description: "Drinks",
        date: "2026-10-11",
        shares: [
          { userId: "u3", shareMinor: 1000 },
          { userId: "u4", shareMinor: 1000 },
        ],
      },
      {
        id: "exp3",
        groupId: "g1",
        paidById: "u3",
        totalMinor: 500,
        description: "Snack",
        date: "2026-10-11",
        shares: [{ userId: "u4", shareMinor: 500 }],
      },
    ];

    const settlements: SettlementRecord[] = [];

    const netBalances = computeGroupNetBalances(memberIds, expenses, settlements);
    const sumNet = Object.values(netBalances).reduce((a, b) => a + b, 0);
    expect(sumNet).toBe(0);

    const result = simplifyDebts(memberIds, expenses, settlements);
    // At most (4 - 1) = 3 payments
    expect(result.simplifiedPayments.length).toBeLessThanOrEqual(3);
  });

  it("Done when: A paid for B and C, and B paid for C, shows fewer or equal suggested payments than raw debts, and recording all suggested payments brings every balance to 0.00", () => {
    const memberIds = ["A", "B", "C"];

    // 1. A paid 60.00 split equally among A, B, C (20 each) -> B owes A 20, C owes A 20
    // 2. B paid 30.00 split equally among B, C (15 each) -> C owes B 15
    // Raw debts:
    // B owes A 20
    // C owes A 20
    // C owes B 15
    // Total raw debts = 3
    const expenses: SharedExpenseRecord[] = [
      {
        id: "e1",
        groupId: "g1",
        paidById: "A",
        totalMinor: 6000,
        description: "Dinner",
        date: "2026-10-11",
        shares: [
          { userId: "A", shareMinor: 2000 },
          { userId: "B", shareMinor: 2000 },
          { userId: "C", shareMinor: 2000 },
        ],
      },
      {
        id: "e2",
        groupId: "g1",
        paidById: "B",
        totalMinor: 3000,
        description: "Taxi",
        date: "2026-10-11",
        shares: [
          { userId: "B", shareMinor: 1500 },
          { userId: "C", shareMinor: 1500 },
        ],
      },
    ];

    const result = simplifyDebts(memberIds, expenses, []);

    // Raw debts = 3 (B owes A, C owes A, C owes B)
    expect(result.rawDebtCount).toBe(3);

    // Simplified payments <= raw debts
    expect(result.simplifiedCount).toBeLessThan(result.rawDebtCount);
    // Specifically:
    // Net balances:
    // A: +4000 (creditor)
    // B: -2000 + 1500 = -500 (debtor)
    // C: -2000 - 1500 = -3500 (debtor)
    // Simplified payments:
    // C pays A 3500
    // B pays A 500
    // Total 2 payments instead of 3!
    expect(result.simplifiedCount).toBe(2);

    // Check that recording all suggested payments brings every net balance to exactly 0.00
    const settlements: SettlementRecord[] = result.simplifiedPayments.map((p, idx) => ({
      id: `set_${idx}`,
      groupId: "g1",
      fromUserId: p.fromUserId,
      toUserId: p.toUserId,
      amountMinor: p.amountMinor,
      date: "2026-10-11",
    }));

    const finalBalances = computeGroupNetBalances(memberIds, expenses, settlements);
    expect(finalBalances["A"]).toBe(0);
    expect(finalBalances["B"]).toBe(0);
    expect(finalBalances["C"]).toBe(0);
  });
});
