import {userSchema} from "~/utils/schema";
import {users} from "../db/schema";
import {eq} from "drizzle-orm";

export default defineEventHandler(async event => {
  const db = useDrizzle();
  const {username, password} = await readValidatedBody(event, userSchema.parse);
  const prev = await db.select().from(users).where(eq(users.username, username));
  if (prev.length) {
    throw createError({statusCode: 409, message: "Username already taken"});
  }

  const [user] = await db
    .insert(users)
    .values({username, password: await hashPassword(password)})
    .returning({username: users.username, id: users.id});

  await setUserSession(event, {user: {name: user.username, id: String(user.id)}});
  return {};
});
