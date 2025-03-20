import type {PostgresJsDatabase} from "drizzle-orm/postgres-js";

export const initPGlite = async () => {
  const {PGlite} = await import("@electric-sql/pglite");
  const {drizzle} = await import("drizzle-orm/pglite");

  return drizzle({client: new PGlite(process.env.DB_URL!)});
};

let db: PostgresJsDatabase<Record<string, never>>;
// @ts-expect-error element any type
if (import.meta.dev || globalThis.Deno) {
  // @ts-expect-error pglite !== postgres
  db = await initPGlite();
} else {
  const {default: postgres} = await import("postgres");
  const {drizzle} = await import("drizzle-orm/postgres-js");
  db = drizzle({client: postgres(process.env.DB_URL!)});
}

export const useDrizzle = () => db;
