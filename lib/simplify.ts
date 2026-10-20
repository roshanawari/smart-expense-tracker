import { SharedExpenseRecord, SettlementRecord, computeGroupNetBalances } from "./ledger";

export interface SimplifiedPayment {
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
}

export interface SimplificationResult {
  simplifiedPayments: SimplifiedPayment[];
  rawDebtCount: number;
  simplifiedCount: number;
  netBalances: Record<string, number>;
}

/**
 * Computes pairwise net obligations between members in a group.
 * A pairwise debt exists if pairBalance > 0 (meaning userB owes userA, so userB -> userA).
 */
export function computeRawDebts(
  memberUserIds: string[],
  expenses: SharedExpenseRecord[],
  settlements: SettlementRecord[]
): { fromUserId: string; toUserId: string; amountMinor: number }[] {
  // We compute pairwise balance: net amount userB owes userA
  // using each expense and settlement in this group
  const pairwise = new Map<string, number>(); // key: `${from}->${to}`

  // For every expense, each participant owes their share to the payer
  for (const exp of expenses) {
    for (const share of exp.shares) {
      if (share.userId !== exp.paidById && share.shareMinor > 0) {
        // share.userId owes exp.paidById share.shareMinor
        const from = share.userId;
        const to = exp.paidById;
        const key = `${from}->${to}`;
        pairwise.set(key, (pairwise.get(key) || 0) + share.shareMinor);
      }
    }
  }

  // For settlements, fromUserId paid toUserId, reducing what fromUserId owes toUserId
  // or increasing what toUserId owes fromUserId
  for (const set of settlements) {
    if (set.fromUserId !== set.toUserId && set.amountMinor > 0) {
      const from = set.fromUserId;
      const to = set.toUserId;
      const directKey = `${from}->${to}`;
      const reverseKey = `${to}->${from}`;

      // Reduce from->to debt
      const currentDirect = pairwise.get(directKey) || 0;
      if (currentDirect >= set.amountMinor) {
        pairwise.set(directKey, currentDirect - set.amountMinor);
      } else {
        pairwise.delete(directKey);
        const remainder = set.amountMinor - currentDirect;
        // now to owes from remainder
        pairwise.set(reverseKey, (pairwise.get(reverseKey) || 0) + remainder);
      }
    }
  }

  // Net out between each pair (A->B and B->A)
  const result: { fromUserId: string; toUserId: string; amountMinor: number }[] = [];
  const processedPairs = new Set<string>();

  for (let i = 0; i < memberUserIds.length; i++) {
    for (let j = i + 1; j < memberUserIds.length; j++) {
      const u1 = memberUserIds[i];
      const u2 = memberUserIds[j];
      const debt1To2 = pairwise.get(`${u1}->${u2}`) || 0;
      const debt2To1 = pairwise.get(`${u2}->${u1}`) || 0;

      if (debt1To2 > debt2To1) {
        result.push({
          fromUserId: u1,
          toUserId: u2,
          amountMinor: debt1To2 - debt2To1,
        });
      } else if (debt2To1 > debt1To2) {
        result.push({
          fromUserId: u2,
          toUserId: u1,
          amountMinor: debt2To1 - debt1To2,
        });
      }
    }
  }

  return result;
}

/**
 * Simplifies group debts by repeatedly matching the largest debtor with the largest creditor
 * and paying min(debt, credit) until all net balances are 0.
 * Produces at most (members - 1) payments.
 */
export function simplifyDebts(
  memberUserIds: string[],
  expenses: SharedExpenseRecord[],
  settlements: SettlementRecord[]
): SimplificationResult {
  const netBalances = computeGroupNetBalances(memberUserIds, expenses, settlements);
  const rawDebts = computeRawDebts(memberUserIds, expenses, settlements);

  // Separate debtors (net < 0) and creditors (net > 0)
  interface Party {
    userId: string;
    amount: number; // positive value representing magnitude
  }

  const debtors: Party[] = [];
  const creditors: Party[] = [];

  for (const uid of memberUserIds) {
    const bal = netBalances[uid] || 0;
    if (bal < 0) {
      debtors.push({ userId: uid, amount: -bal });
    } else if (bal > 0) {
      creditors.push({ userId: uid, amount: bal });
    }
  }

  const simplifiedPayments: SimplifiedPayment[] = [];

  // Repeatedly match largest debtor with largest creditor
  while (debtors.length > 0 && creditors.length > 0) {
    // Sort descending by amount
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const largestDebtor = debtors[0];
    const largestCreditor = creditors[0];

    const paymentAmount = Math.min(largestDebtor.amount, largestCreditor.amount);

    if (paymentAmount > 0) {
      simplifiedPayments.push({
        fromUserId: largestDebtor.userId,
        toUserId: largestCreditor.userId,
        amountMinor: paymentAmount,
      });

      largestDebtor.amount -= paymentAmount;
      largestCreditor.amount -= paymentAmount;
    }

    if (largestDebtor.amount === 0) {
      debtors.shift();
    }
    if (largestCreditor.amount === 0) {
      creditors.shift();
    }
  }

  return {
    simplifiedPayments,
    rawDebtCount: rawDebts.length,
    simplifiedCount: simplifiedPayments.length,
    netBalances,
  };
}
