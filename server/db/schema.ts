import {
  pgTable,
  integer,
  varchar,
  boolean,
  timestamp,
  uuid,
  jsonb,
  type AnyPgColumn,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {BattleRecipe, BugReports} from "../gameServer";
import {sql} from "drizzle-orm";

export const users = pgTable(
  "users",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    username: varchar({length: 32}).notNull(),
    password: varchar({length: 256}).notNull(),
    admin: boolean().default(false).notNull(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  table => [uniqueIndex("usernameUniqueIndex").on(lower(table.username))],
);

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

export const bugReports = pgTable("bugReports", {
  id: uuid().primaryKey(),
  battle: jsonb().$type<BattleRecipe>().notNull(),
  reports: jsonb().$type<BugReports>().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
});

export const lower = (email: AnyPgColumn) => {
  return sql`lower(${email})`;
};
