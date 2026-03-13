import {eq} from "drizzle-orm";
import {users} from "~~/server/db/schema";

export default defineEventHandler(async event => {
  const id = getRouterParam(event, "id");
  if (id) {
    const [user] = await translateDbError(
      useDrizzle().select().from(users).where(eq(users.id, +id)),
    );
    if (user) {
      return {
        name: user.username,
        admin: user.admin,
        createdAt: user.createdAt.getTime(),
      };
    }
  }

  throw createError({statusCode: 404, message: "No user by this ID could be found"});
});
