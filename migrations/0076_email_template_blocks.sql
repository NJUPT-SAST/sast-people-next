-- 邮件模板可编辑化：
-- 1) email_template_setting 增加正文区块（body_blocks）与主题色（theme_color）。
--    body_blocks 为 NULL 表示未自定义，渲染时按内置版式生成（见 lib/email/blocks.ts）；
--    theme_color 为空字符串表示沿用内置的通过绿 / 不通过橙。
-- 2) 新增 email_template_style_preset：把一段自定义 HTML/CSS 存成具名样式，跨模板复用。

ALTER TABLE "email_template_setting"
  ADD COLUMN IF NOT EXISTS "body_blocks" jsonb;

ALTER TABLE "email_template_setting"
  ADD COLUMN IF NOT EXISTS "theme_color" varchar(16) NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS "email_template_style_preset" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(80) NOT NULL,
  "department" varchar(64),
  "blocks" jsonb NOT NULL,
  "created_by_id" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_template_style_preset_name_uidx"
  ON "email_template_style_preset" ("name", COALESCE("department", ''));

CREATE INDEX IF NOT EXISTS "email_template_style_preset_department_idx"
  ON "email_template_style_preset" ("department");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sastpeople') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE "email_template_style_preset" TO sastpeople;
    GRANT USAGE, SELECT
      ON SEQUENCE "email_template_style_preset_id_seq" TO sastpeople;
  END IF;
END $$;
