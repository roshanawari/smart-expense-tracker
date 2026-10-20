import { z } from "zod";

export const overallBudgetSchema = z.object({
  amountMinor: z.number().int().positive().max(100_000_000_000).nullable().optional(),
  amount: z.union([z.string(), z.number()]).nullable().optional(),
});

export const categoryBudgetSchema = z.object({
  amountMinor: z.number().int().positive().max(100_000_000_000).optional(),
  amount: z.union([z.string(), z.number()]).optional(),
});
