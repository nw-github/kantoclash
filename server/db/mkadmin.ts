import { useDrizzle } from "../utils/db";
import { users } from "./schema";
import { eq } from "drizzle-orm";

const db = useDrizzle();
const user = await db
  .update(users)
  .set({ admin: true })
  .where(eq(users.username, process.env.ADMIN_USERNAME!))
  .returning();
console.log(user);
