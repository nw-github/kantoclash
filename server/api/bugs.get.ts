import {bugReports} from "~~/server/db/schema";

export default defineEventHandler(async event => {
  const user = (await getUserSession(event)).user;
  if (!user || !user.admin) {
    throw createError({statusCode: 401, message: "Unauthorized"});
  }

  return await useDrizzle().select().from(bugReports).orderBy(bugReports.createdAt);
});
