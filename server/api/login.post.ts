import {userSchema} from "~/utils/schema";
import {users} from "../db/schema";
import {eq} from "drizzle-orm";

declare module "#auth-utils" {
  interface User {
    name: string;
    id: string;
    admin?: bool;
  }
}

export default defineEventHandler(async event => {
  const db = useDrizzle();
  const {username, password} = await readValidatedBody(event, userSchema.parse);
  const [user] = await db.select().from(users).where(eq(users.username, username));

  if (!(await verifyPassword(user?.password, password))) {
    throw createError({statusCode: 401, message: "Bad credentials"});
  }

  await setUserSession(event, {user: {name: username, id: String(user.id), admin: user.admin}});
  return {};
});
