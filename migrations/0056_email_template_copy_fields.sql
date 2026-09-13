ALTER TABLE "email_template_setting"
  ADD COLUMN IF NOT EXISTS "title_template" varchar(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "subtitle_template" varchar(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "result_badge_template" varchar(100) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "result_title_template" varchar(255) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "result_summary_template" varchar(255) NOT NULL DEFAULT '';
