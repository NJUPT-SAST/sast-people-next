-- Custom SQL migration file, put your code below! --
ALTER TABLE "interview_schedule"
  ADD COLUMN IF NOT EXISTS "provider_calendar_id" varchar(255) NOT NULL DEFAULT 'primary';
