import { USERS } from "../login.post";

export default defineEventHandler(async event => {
  const id = getRouterParam(event, "id");
  const res = USERS.entries().find(([_, user]) => id === user.id);
  if (!res) {
    throw createError({ statusCode: 404, message: "No user by this ID could be found" });
  }
  return { name: res[0] };
});
