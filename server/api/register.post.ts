import { userSchema } from "~/utils/schema";
import { USERS } from "./login.post";

export default defineEventHandler(async event => {
  const { username, password } = await readValidatedBody(event, userSchema.parse);
  if (USERS.get(username)) {
    throw createError({ statusCode: 409, message: "Username already taken" });
  }

  USERS.set(username, { password: await hashPassword(password), id: String(USERS.size) });

  await setUserSession(event, { user: { name: username, id: USERS.get(username)!.id } });
  return {};
});
