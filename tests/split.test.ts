import { describe, it, expect } from "vitest";
import { splitEqual, splitPercent, splitExact } from "@/lib/split";

describe("Expense Split Logic (lib/split.ts)", () => {
  describe("splitEqual", () => {
    it("splits equally with leftover paise distributed to the first participants in fixed order", () => {
      // 100.00 INR (10,000 paise) among 3 people
      // 10000 / 3 = 3333 with 1 remainder
      // Shares: 3334, 3333, 3333 (₹33.34, ₹33.33, ₹33.33)
      const res = splitEqual(10000, ["userA", "userB", "userC"]);
      expect(res).toEqual([
        { userId: "userA", shareMinor: 3334 },
        { userId: "userB", shareMinor: 3333 },
        { userId: "userC", shareMinor: 3333 },
      ]);
      const sum = res.reduce((a, b) => a + b.shareMinor, 0);
      expect(sum).toBe(10000);
    });

    it("splits evenly when there is no leftover", () => {
      const res = splitEqual(9000, ["userA", "userB", "userC"]);
      expect(res).toEqual([
        { userId: "userA", shareMinor: 3000 },
        { userId: "userB", shareMinor: 3000 },
        { userId: "userC", shareMinor: 3000 },
      ]);
    });

    it("throws when total amount is <= 0 or participants list is empty", () => {
      expect(() => splitEqual(0, ["userA"])).toThrow("Total amount must be greater than 0");
      expect(() => splitEqual(1000, [])).toThrow("At least one participant is required");
    });
  });

  describe("splitPercent", () => {
    it("allocates correct shares when percentages sum to 100%", () => {
      const res = splitPercent(10000, [
        { userId: "userA", percent: 50 },
        { userId: "userB", percent: 30 },
        { userId: "userC", percent: 20 },
      ]);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.shares).toEqual([
          { userId: "userA", shareMinor: 5000 },
          { userId: "userB", shareMinor: 3000 },
          { userId: "userC", shareMinor: 2000 },
        ]);
        const sum = res.shares.reduce((a, b) => a + b.shareMinor, 0);
        expect(sum).toBe(10000);
      }
    });

    it("blocks save when percentages do not sum to 100% and returns remaining percent", () => {
      const res = splitPercent(10000, [
        { userId: "userA", percent: 40 },
        { userId: "userB", percent: 40 },
      ]);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.remainingPercent).toBe(20);
        expect(res.error).toContain("Percentages must total 100%");
      }
    });
  });

  describe("splitExact", () => {
    it("accepts valid exact allocations summing to totalMinor", () => {
      const res = splitExact(15000, [
        { userId: "userA", amountMinor: 7000 },
        { userId: "userB", amountMinor: 5000 },
        { userId: "userC", amountMinor: 3000 },
      ]);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.shares.length).toBe(3);
        const sum = res.shares.reduce((a, b) => a + b.shareMinor, 0);
        expect(sum).toBe(15000);
      }
    });

    it("blocks save when exact shares do not sum to totalMinor and returns remainingMinor", () => {
      const res = splitExact(15000, [
        { userId: "userA", amountMinor: 7000 },
        { userId: "userB", amountMinor: 5000 },
      ]);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.remainingMinor).toBe(3000);
        expect(res.error).toContain("Exact shares must sum to total");
      }
    });
  });
});
