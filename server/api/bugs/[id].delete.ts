import {eq} from "drizzle-orm";
import {bugReports} from "~~/server/db/schema";

export default defineEventHandler(async event => {
  const user = (await getUserSession(event)).user;
  if (!user || !user.admin) {
    throw createError({statusCode: 401, message: "Unauthorized"});
  }

  const id = getRouterParam(event, "id");
  if (id) {
    const [report] = await useDrizzle().delete(bugReports).where(eq(bugReports.id, id)).returning();
    if (user) {
      return {id: report.id};
    }
  }

  throw createError({statusCode: 404, message: "No bug report with this ID could be found"});
});
