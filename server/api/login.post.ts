import { userSchema } from "~/utils/schema";

declare module "#auth-utils" {
  interface User {
    name: string;
    id: string;
  }
}

export const USERS = new Map<string, { password: string; id: string }>([
  ["admin", { password: "", id: "0" }],
  ["user", { password: "", id: "1" }],
]);

hashPassword("123").then(pw => (USERS.get("admin")!.password = pw));
hashPassword("123").then(pw => (USERS.get("user")!.password = pw));

export default defineEventHandler(async event => {
  const { username, password } = await readValidatedBody(event, userSchema.parse);
  const user = USERS.get(username);
  if (!user || !(await verifyPassword(user.password, password))) {
    throw createError({ statusCode: 401, message: "Bad credentials" });
  }

  await setUserSession(event, { user: { name: username, id: user.id } });
  return {};
});
