import {z} from "zod";
import {RegExpMatcher, englishDataset, englishRecommendedTransformers} from "obscenity";

export const profanityMatcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

export const userSchema = z.object({
  username: z
    .string()
    .min(4, "Must be at least 4 characters")
    .max(24, "Must be at most 24 characters")
    .regex(/[a-zA-Z0-9 ]+/, "English alphanumeric characters only")
    .trim()
    .refine(text => !profanityMatcher.hasMatch(text), "Must not contain obscenities"),
  password: z.string().min(3, "Password must be at least 3 characters"),
});
