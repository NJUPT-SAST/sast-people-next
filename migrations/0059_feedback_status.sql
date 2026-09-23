ALTER TABLE "feedback_report"
  ADD COLUMN IF NOT EXISTS "status" varchar(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "resolution_note" text,
  ADD COLUMN IF NOT EXISTS "resolved_by" integer,
  ADD COLUMN IF NOT EXISTS "resolved_at" timestamptz;
