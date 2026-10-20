import { z } from "zod";

export const createGoalSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(50, "Name must be at most 50 characters"),
  targetMinor: z.number().int().positive("Target amount must be greater than 0").max(100_000_000_000).optional(),
  target: z.union([z.string(), z.number()]).optional(),
  targetDate: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Invalid date format (YYYY-MM-DD)")
    .nullable()
    .optional(),
});

export const updateGoalSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  targetMinor: z.number().int().positive().max(100_000_000_000).optional(),
  target: z.union([z.string(), z.number()]).optional(),
  targetDate: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, "Invalid date format (YYYY-MM-DD)")
    .nullable()
    .optional(),
});

export const addSavingsSchema = z.object({
  amountMinor: z.number().int().positive("Amount must be greater than 0").max(100_000_000_000).optional(),
  amount: z.union([z.string(), z.number()]).optional(),
});
