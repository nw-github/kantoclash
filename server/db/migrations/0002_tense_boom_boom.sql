CREATE TABLE "bugReports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"battle" jsonb NOT NULL,
	"reports" jsonb NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
