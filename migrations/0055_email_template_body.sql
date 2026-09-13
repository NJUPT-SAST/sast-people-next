ALTER TABLE "email_template_setting"
  ADD COLUMN IF NOT EXISTS "body_template" text NOT NULL DEFAULT '';
