import { userSchema } from "~/utils/schema";
import { USERS } from "./login.post";
import { v4 as uuid } from "uuid";

export default defineEventHandler(async event => {
  const { username, password } = await readValidatedBody(event, userSchema.parse);
  if (USERS[username]) {
    throw createError({ statusCode: 409, message: "Username already taken" });
  }

  USERS[username] = { password: await hashPassword(password), id: uuid() };

  await setUserSession(event, { user: { name: username, id: USERS[username].id } });
  return {};
});
