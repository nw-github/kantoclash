import { z } from "zod";

export const userSchema = z.object({
  username: z
    .string()
    .min(4, "Must be at least 4 characters")
    .max(24, "Must be at most 24 characters")
    .regex(/[a-zA-Z0-9]+/, "English alphanumeric characters only")
    .trim(),
  password: z.string().min(3, "Password must be at least 3 characters"),
});
