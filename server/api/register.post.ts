import {userSchema} from "~/utils/schema";
import {users} from "../db/schema";

export default defineEventHandler(async event => {
  const {username, password} = await readValidatedBody(event, userSchema.parse);
  const [user] = await translateDbError(
    useDrizzle()
      .insert(users)
      .values({username, password: await hashPassword(password)})
      .returning({username: users.username, id: users.id})
      .onConflictDoNothing(),
  );

  if (!user) {
    throw createError({statusCode: 409, message: "Username already taken"});
  }

  await setUserSession(event, {user: {name: user.username, id: String(user.id)}});
  return {};
});
