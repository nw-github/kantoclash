import {userSchema} from "~/utils/schema";
import {lower, users} from "../db/schema";
import {eq} from "drizzle-orm";

declare module "#auth-utils" {
  interface User {
    name: string;
    id: string;
    admin?: bool;
  }
}

export default defineEventHandler(async event => {
  const {username, password} = await readValidatedBody(event, userSchema.parse);
  const [user] = await translateDbError(
    useDrizzle()
      .select()
      .from(users)
      .where(eq(lower(users.username), username.toLowerCase())),
  );

  if (!(await verifyPassword(user?.password, password))) {
    throw createError({statusCode: 401, message: "Bad credentials"});
  }

  await setUserSession(event, {
    user: {name: user.username, id: String(user.id), admin: user.admin},
  });
  return {};
});
