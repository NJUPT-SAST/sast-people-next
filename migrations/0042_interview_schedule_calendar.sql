-- Custom SQL migration file, put your code below! --
ALTER TABLE "interview_schedule"
  ADD COLUMN IF NOT EXISTS "provider_calendar_id" varchar(255);

ALTER TABLE "interview_schedule"
  ALTER COLUMN "provider_calendar_id" SET DEFAULT 'primary';

UPDATE "interview_schedule"
SET "provider_calendar_id" = 'primary'
WHERE "provider_calendar_id" IS NULL;

ALTER TABLE "interview_schedule"
  ALTER COLUMN "provider_calendar_id" SET NOT NULL;
