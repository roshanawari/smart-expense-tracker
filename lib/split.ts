export interface SplitResult {
  userId: string;
  shareMinor: number;
}

export type SplitOutcome =
  | { success: true; shares: SplitResult[] }
  | { success: false; error: string; remainingPercent?: number; remainingMinor?: number };

/**
 * Splits an amount equally among participants.
 * Extra leftover paise (totalMinor % N) are allocated +1 paise
 * to the first participants in the order provided.
 */
export function splitEqual(
  totalMinor: number,
  participantUserIds: string[]
): SplitResult[] {
  if (totalMinor <= 0) {
    throw new Error("Total amount must be greater than 0");
  }
  if (!participantUserIds || participantUserIds.length === 0) {
    throw new Error("At least one participant is required");
  }

  const count = participantUserIds.length;
  const baseShare = Math.floor(totalMinor / count);
  const leftoverPaise = totalMinor % count;

  return participantUserIds.map((userId, index) => ({
    userId,
    shareMinor: baseShare + (index < leftoverPaise ? 1 : 0),
  }));
}

/**
 * Splits an amount according to percentage shares.
 * Sum of percentages must equal exactly 100%.
 * Any tiny integer rounding difference is reconciled with the first participant.
 */
export function splitPercent(
  totalMinor: number,
  participants: { userId: string; percent: number }[]
): SplitOutcome {
  if (totalMinor <= 0) {
    return { success: false, error: "Total amount must be greater than 0" };
  }
  if (!participants || participants.length === 0) {
    return { success: false, error: "At least one participant is required" };
  }

  const sumPercent = participants.reduce((sum, p) => sum + p.percent, 0);
  const roundedSum = Math.round(sumPercent * 100) / 100;

  if (Math.abs(roundedSum - 100) > 0.001) {
    const remaining = Math.round((100 - sumPercent) * 100) / 100;
    return {
      success: false,
      error: `Percentages must total 100%. Currently ${roundedSum}%.`,
      remainingPercent: remaining,
    };
  }

  const shares: SplitResult[] = participants.map((p) => ({
    userId: p.userId,
    shareMinor: Math.round((totalMinor * p.percent) / 100),
  }));

  // Reconcile any rounding delta with the first participant
  const totalAllocated = shares.reduce((sum, s) => sum + s.shareMinor, 0);
  const diff = totalMinor - totalAllocated;
  if (diff !== 0 && shares.length > 0) {
    shares[0].shareMinor += diff;
  }

  return { success: true, shares };
}

/**
 * Splits an amount with exact amounts specified per participant.
 * Sum of exact shares must equal totalMinor.
 */
export function splitExact(
  totalMinor: number,
  participants: { userId: string; amountMinor: number }[]
): SplitOutcome {
  if (totalMinor <= 0) {
    return { success: false, error: "Total amount must be greater than 0" };
  }
  if (!participants || participants.length === 0) {
    return { success: false, error: "At least one participant is required" };
  }

  for (const p of participants) {
    if (p.amountMinor < 0) {
      return { success: false, error: "Shares cannot be negative" };
    }
  }

  const sumMinor = participants.reduce((sum, p) => sum + p.amountMinor, 0);
  if (sumMinor !== totalMinor) {
    const remaining = totalMinor - sumMinor;
    return {
      success: false,
      error: `Exact shares must sum to total. Remaining: ${remaining} paise.`,
      remainingMinor: remaining,
    };
  }

  return {
    success: true,
    shares: participants.map((p) => ({
      userId: p.userId,
      shareMinor: p.amountMinor,
    })),
  };
}
