import { migrate } from "drizzle-orm/pglite/migrator";
import drizzleConfig from "../../drizzle.config";
import { useDrizzle } from "../utils/db";

await migrate(useDrizzle() as any, { migrationsFolder: drizzleConfig.out! });
