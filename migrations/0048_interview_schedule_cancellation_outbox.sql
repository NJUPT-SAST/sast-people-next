CREATE TABLE IF NOT EXISTS "interview_schedule_cancellation_outbox" (
  "id" serial PRIMARY KEY NOT NULL,
  "fk_interview_schedule_id" integer NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp DEFAULT now() NOT NULL,
  "locked_until" timestamp,
  "last_attempt_at" timestamp,
  "last_error" text,
  "published_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "interview_schedule_cancellation_outbox_schedule_uidx"
    UNIQUE("fk_interview_schedule_id"),
  CONSTRAINT "interview_schedule_cancellation_outbox_schedule_fk"
    FOREIGN KEY ("fk_interview_schedule_id")
    REFERENCES "public"."interview_schedule"("id")
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "interview_schedule_cancellation_outbox_pending_idx"
  ON "interview_schedule_cancellation_outbox" ("next_attempt_at")
  WHERE "published_at" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sastpeople') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE "interview_schedule_cancellation_outbox" TO sastpeople;
    GRANT USAGE, SELECT
      ON SEQUENCE "interview_schedule_cancellation_outbox_id_seq" TO sastpeople;
  END IF;
END $$;
