-- 部门级邮件模板：同一模板键可为「全局默认」(department IS NULL) 与各部门覆盖各存一行。
-- People 不维护部门目录；department 为 Link 部门标识（varchar(64)）。
ALTER TABLE "email_template_setting"
  ADD COLUMN IF NOT EXISTS "department" varchar(64);

ALTER TABLE "email_template_content"
  ADD COLUMN IF NOT EXISTS "department" varchar(64);

-- 原唯一约束是「每个模板键一行」；改为「每个模板键每个部门一行」，NULL 视作全局默认参与唯一性。
ALTER TABLE "email_template_setting"
  DROP CONSTRAINT IF EXISTS "email_template_setting_template_key_unique";

ALTER TABLE "email_template_content"
  DROP CONSTRAINT IF EXISTS "email_template_content_template_key_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "email_template_setting_key_department_uidx"
  ON "email_template_setting" ("template_key", COALESCE("department", ''));

CREATE UNIQUE INDEX IF NOT EXISTS "email_template_content_key_department_uidx"
  ON "email_template_content" ("template_key", COALESCE("department", ''));

CREATE INDEX IF NOT EXISTS "email_template_setting_department_idx"
  ON "email_template_setting" ("department");

CREATE INDEX IF NOT EXISTS "email_template_content_department_idx"
  ON "email_template_content" ("department");
