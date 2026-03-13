ALTER TABLE "users" DROP CONSTRAINT "users_username_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "usernameUniqueIndex" ON "users" USING btree (lower("username"));