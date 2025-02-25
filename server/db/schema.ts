import { pgTable, integer as pgInt, varchar, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: pgInt().primaryKey().generatedAlwaysAsIdentity(),
  username: varchar({ length: 32 }).unique().notNull(),
  password: varchar({ length: 256 }).notNull(),
  admin: boolean().default(false).notNull(),
});
