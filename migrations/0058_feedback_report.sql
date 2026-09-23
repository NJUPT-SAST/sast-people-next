CREATE TABLE IF NOT EXISTS "feedback_report" (
  "id" serial PRIMARY KEY NOT NULL,
  "fk_user_id" integer,
  "user_name" varchar(80),
  "student_id" varchar(64),
  "category" varchar(32) NOT NULL,
  "title" varchar(160) NOT NULL,
  "description" text NOT NULL,
  "contact" varchar(160),
  "page_url" text,
  "environment" varchar(64),
  "device_name" varchar(160),
  "browser_info" text,
  "viewport" varchar(64),
  "user_agent" text,
  "referer" text,
  "ip_address" varchar(64),
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "feedback_report_user_id_idx" ON "feedback_report" ("fk_user_id");
CREATE INDEX IF NOT EXISTS "feedback_report_created_at_idx" ON "feedback_report" ("created_at");
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sastpeople') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "feedback_report" TO sastpeople;
    GRANT USAGE, SELECT ON SEQUENCE "feedback_report_id_seq" TO sastpeople;
  END IF;
END $$;
