import { v4 as uuid } from "uuid";
import { userSchema } from "~/utils/schema";

declare module "#auth-utils" {
  interface User {
    name: string;
    id: string;
  }
}

export const USERS: Record<string, { password: string; id: string }> = {
  admin: { password: "", id: uuid() },
  user: { password: "", id: uuid() },
};

hashPassword("123").then(pw => (USERS.admin.password = pw));
hashPassword("123").then(pw => (USERS.user.password = pw));

export default defineEventHandler(async event => {
  const { username, password } = await readValidatedBody(event, userSchema.parse);

  if (!(await verifyPassword(USERS[username]?.password, password))) {
    throw createError({ statusCode: 401, message: "Bad credentials" });
  }

  await setUserSession(event, { user: { name: username, id: USERS[username].id } });
  return {};
});
