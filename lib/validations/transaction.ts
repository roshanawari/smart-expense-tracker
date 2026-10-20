import { z } from "zod";

const dateRegex = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

export function isValidDate(dateStr: string): boolean {
  if (!dateRegex.test(dateStr)) return false;
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

export const createTransactionSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  amountMinor: z
    .number()
    .int("Amount must be an integer in smallest currency units")
    .positive("Amount must be greater than 0")
    .max(100000000000, "Amount must be below 1,000,000,000"),
  date: z
    .string()
    .regex(dateRegex, "Date must be in YYYY-MM-DD format")
    .refine(isValidDate, "Date must be a valid calendar date"),
  categoryId: z.string().min(1, "Category is required"),
  description: z
    .string()
    .max(200, "Description must be at most 200 characters")
    .optional()
    .nullable(),
});

export const updateTransactionSchema = createTransactionSchema.partial();

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
