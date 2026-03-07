import {userSchema} from "~/utils/schema";
import {users} from "../db/schema";

export default defineEventHandler(async event => {
  const db = useDrizzle();
  const {username, password} = await readValidatedBody(event, userSchema.parse);

  let user;
  try {
    [user] = await db
      .insert(users)
      .values({username, password: await hashPassword(password)})
      .returning({username: users.username, id: users.id})
      .onConflictDoNothing();
  } catch {
    throw createError({statusCode: 500, message: "Internal error occurred"});
  }

  if (!user) {
    throw createError({statusCode: 409, message: "Username already taken"});
  }

  await setUserSession(event, {user: {name: user.username, id: String(user.id)}});
  return {};
});
