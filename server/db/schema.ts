import {pgTable, integer, varchar, boolean, timestamp} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  username: varchar({length: 32}).unique().notNull(),
  password: varchar({length: 256}).notNull(),
  admin: boolean().default(false).notNull(),
  createdAt: timestamp().notNull().defaultNow(),
});

export const battles = pgTable("battles", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  player1: integer()
    .notNull()
    .references(() => users.id),
  player2: integer()
    .notNull()
    .references(() => users.id),
  winner: integer().references(() => users.id),
  format: varchar({length: 32}).notNull(),
  createdAt: timestamp().notNull().defaultNow(),
});
