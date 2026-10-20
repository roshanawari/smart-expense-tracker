export interface SharedExpenseRecord {
  id: string;
  groupId: string | null;
  paidById: string;
  totalMinor: number;
  description: string;
  date: string;
  shares: {
    userId: string;
    shareMinor: number;
  }[];
}

export interface SettlementRecord {
  id: string;
  groupId: string | null;
  fromUserId: string;
  toUserId: string;
  amountMinor: number;
  date: string;
  note?: string | null;
}

/**
 * Computes the net balance from currentUserId's perspective relative to otherUserId.
 * Positive (> 0): otherUser owes currentUser.
 * Negative (< 0): currentUser owes otherUser.
 * Zero (=== 0): Settled up.
 */
export function computePairwiseBalance(
  currentUserId: string,
  otherUserId: string,
  expenses: SharedExpenseRecord[],
  settlements: SettlementRecord[]
): number {
  let netBalanceMinor = 0;

  for (const exp of expenses) {
    if (exp.paidById === currentUserId) {
      // Current user paid: any share belonging to otherUser is owed to currentUser
      const otherShare = exp.shares.find((s) => s.userId === otherUserId);
      if (otherShare) {
        netBalanceMinor += otherShare.shareMinor;
      }
    } else if (exp.paidById === otherUserId) {
      // Other user paid: any share belonging to currentUser is owed to otherUser
      const myShare = exp.shares.find((s) => s.userId === currentUserId);
      if (myShare) {
        netBalanceMinor -= myShare.shareMinor;
      }
    }
  }

  for (const set of settlements) {
    if (set.fromUserId === currentUserId && set.toUserId === otherUserId) {
      // Current user paid other user -> increases currentUser balance
      netBalanceMinor += set.amountMinor;
    } else if (set.fromUserId === otherUserId && set.toUserId === currentUserId) {
      // Other user paid current user -> decreases currentUser balance
      netBalanceMinor -= set.amountMinor;
    }
  }

  return netBalanceMinor;
}

/**
 * Computes overall net balance for each member in a group.
 * Positive: member is owed money.
 * Negative: member owes money.
 * Sum of all net balances in a group is always 0.
 */
export function computeGroupNetBalances(
  memberUserIds: string[],
  expenses: SharedExpenseRecord[],
  settlements: SettlementRecord[]
): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const uid of memberUserIds) {
    balances[uid] = 0;
  }

  for (const exp of expenses) {
    // Payer is credited the full amount they paid
    if (balances[exp.paidById] !== undefined) {
      balances[exp.paidById] += exp.totalMinor;
    }
    // Each participant is debited their share
    for (const share of exp.shares) {
      if (balances[share.userId] !== undefined) {
        balances[share.userId] -= share.shareMinor;
      }
    }
  }

  for (const set of settlements) {
    // fromUser paid money out -> debited less / credited relative to group
    if (balances[set.fromUserId] !== undefined) {
      balances[set.fromUserId] += set.amountMinor;
    }
    // toUser received money in -> credited less
    if (balances[set.toUserId] !== undefined) {
      balances[set.toUserId] -= set.amountMinor;
    }
  }

  return balances;
}
