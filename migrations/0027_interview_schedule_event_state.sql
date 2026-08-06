ALTER TABLE "interview_schedule"
  ADD COLUMN IF NOT EXISTS "provider_meeting_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "meeting_status" varchar(32) NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS "meeting_ended_at" timestamp;

-- Preserve access to interviews created before live meeting events were tracked.
UPDATE "interview_schedule"
SET "meeting_status" = 'ended', "meeting_ended_at" = "ends_at"
WHERE "status" = 'created' AND "ends_at" <= now();

CREATE UNIQUE INDEX IF NOT EXISTS "interview_schedule_active_user_flow_uidx"
  ON "interview_schedule" ("fk_user_flow_id")
  WHERE "status" = 'created';
