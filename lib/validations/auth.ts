import { z } from "zod";

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(50, "Name must be at most 50 characters"),
  email: z
    .string()
    .trim()
    .email("Invalid email format")
    .transform((val) => val.toLowerCase()),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Invalid email format")
    .transform((val) => val.toLowerCase()),
  password: z
    .string()
    .min(1, "Password is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
