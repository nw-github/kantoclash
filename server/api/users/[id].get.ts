import { eq } from "drizzle-orm";
import { users } from "~/server/db/schema";

export default defineEventHandler(async event => {
  const db = useDrizzle();
  const id = getRouterParam(event, "id");
  if (id) {
    const [user] = await db.select().from(users).where(eq(users.id, +id));
    if (user) {
      return { name: user.username };
    }
  }

  throw createError({ statusCode: 404, message: "No user by this ID could be found" });
});
