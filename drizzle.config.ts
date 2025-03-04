import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./server/db/migrations",
  schema: "./server/db/schema.ts",
  dialect: "postgresql",
  driver: "pglite",
  dbCredentials: { url: process.env.DB_URL! },
});
