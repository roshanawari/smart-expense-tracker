import { db } from "../lib/db";
import { hashPassword, createSessionToken } from "../lib/auth";
import { splitEqual } from "../lib/split";
import { simplifyDebts } from "../lib/simplify";
import { formatMoney } from "../lib/money";

async function main() {
  console.log("=== RUNNING REAL MULTI-USER END-TO-END DEMO ===");

  // 1. Create real users: Alice and Bob
  const pw = await hashPassword("password123");
  const alice = await db.user.upsert({
    where: { email: "alice.real@demo.com" },
    update: {},
    create: { name: "Alice Real", email: "alice.real@demo.com", passwordHash: pw },
  });
  const bob = await db.user.upsert({
    where: { email: "bob.real@demo.com" },
    update: {},
    create: { name: "Bob Real", email: "bob.real@demo.com", passwordHash: pw },
  });
  const charlie = await db.user.upsert({
    where: { email: "charlie.real@demo.com" },
    update: {},
    create: { name: "Charlie Real", email: "charlie.real@demo.com", passwordHash: pw },
  });

  console.log(`[Users Created] Alice: ${alice.id}, Bob: ${bob.id}, Charlie: ${charlie.id}`);

  // 2. Add friendship: Alice & Bob, Alice & Charlie, Bob & Charlie
  await db.friendship.deleteMany({
    where: {
      OR: [
        { userAId: alice.id }, { userBId: alice.id },
        { userAId: bob.id }, { userBId: bob.id },
        { userAId: charlie.id }, { userBId: charlie.id },
      ],
    },
  });

  await db.friendship.createMany({
    data: [
      { userAId: alice.id, userBId: bob.id },
      { userAId: alice.id, userBId: charlie.id },
      { userAId: bob.id, userBId: charlie.id },
    ],
  });
  console.log("[Friendships Created] Mutual friendships established between Alice, Bob, and Charlie.");

  // 3. Create Group: "Weekend Getaway"
  const group = await db.group.create({
    data: {
      name: "Weekend Getaway",
      createdById: alice.id,
      members: {
        create: [
          { userId: alice.id },
          { userId: bob.id },
          { userId: charlie.id },
        ],
      },
    },
  });
  console.log(`[Group Created] Group "${group.name}" with 3 members.`);

  // 4. Split Expense: Alice pays 100.00 (10000 paise) split equally among 3
  const shares = splitEqual(10000, [alice.id, bob.id, charlie.id]);
  console.log("[F13 Split Calculation Result]");
  shares.forEach((s) => {
    const name = s.userId === alice.id ? "Alice" : s.userId === bob.id ? "Bob" : "Charlie";
    console.log(`  ${name}: ${s.shareMinor} paise (${formatMoney(s.shareMinor)})`);
  });

  const exp1 = await db.sharedExpense.create({
    data: {
      groupId: group.id,
      paidById: alice.id,
      totalMinor: 10000,
      description: "Group Dinner",
      date: "2026-10-11",
      splitMethod: "EQUAL",
      createdById: alice.id,
      shares: {
        create: shares.map((s) => ({ userId: s.userId, shareMinor: s.shareMinor })),
      },
    },
  });
  console.log(`[Shared Expense Created] ID: ${exp1.id}, Total: ₹100.00`);

  // 5. Debt Simplification check
  // Add second expense: Bob pays 30.00 (3000 paise) split equally between Bob and Charlie (1500 each)
  const exp2 = await db.sharedExpense.create({
    data: {
      groupId: group.id,
      paidById: bob.id,
      totalMinor: 3000,
      description: "Cab Fare",
      date: "2026-10-11",
      splitMethod: "EQUAL",
      createdById: bob.id,
      shares: {
        create: [
          { userId: bob.id, shareMinor: 1500 },
          { userId: charlie.id, shareMinor: 1500 },
        ],
      },
    },
  });

  const allExpenses = await db.sharedExpense.findMany({
    where: { groupId: group.id },
    include: { shares: true },
  });

  const simplification = simplifyDebts([alice.id, bob.id, charlie.id], allExpenses, []);
  console.log("[F17 Debt Simplification Result]");
  console.log(`  Raw Debt Count: ${simplification.rawDebtCount}`);
  console.log(`  Simplified Count: ${simplification.simplifiedCount} (${simplification.simplifiedCount} payments instead of ${simplification.rawDebtCount})`);
  simplification.simplifiedPayments.forEach((p) => {
    const from = p.fromUserId === alice.id ? "Alice" : p.fromUserId === bob.id ? "Bob" : "Charlie";
    const to = p.toUserId === alice.id ? "Alice" : p.toUserId === bob.id ? "Bob" : "Charlie";
    console.log(`  Suggestion: ${from} pays ${to} ${formatMoney(p.amountMinor)}`);
  });

  // 6. Record simplified settlements
  console.log("[F15 Recording Settlements]");
  for (const p of simplification.simplifiedPayments) {
    const s = await db.settlement.create({
      data: {
        groupId: group.id,
        fromUserId: p.fromUserId,
        toUserId: p.toUserId,
        amountMinor: p.amountMinor,
        date: "2026-10-11",
        note: "Settled via simplification",
      },
    });
    console.log(`  Recorded settlement: ${s.id} for ${formatMoney(s.amountMinor)}`);
  }

  // 7. Verify all balances are 0.00
  const finalSettlements = await db.settlement.findMany({ where: { groupId: group.id } });
  const finalSimp = simplifyDebts([alice.id, bob.id, charlie.id], allExpenses, finalSettlements);
  console.log("[Final Balances after Settlements]");
  console.log(`  Alice: ${formatMoney(finalSimp.netBalances[alice.id])}`);
  console.log(`  Bob: ${formatMoney(finalSimp.netBalances[bob.id])}`);
  console.log(`  Charlie: ${formatMoney(finalSimp.netBalances[charlie.id])}`);
  console.log(`  Remaining suggested payments: ${finalSimp.simplifiedCount}`);

  console.log("=== DEMO FINISHED SUCCESSFULLY ===");
}

main().catch(console.error);
