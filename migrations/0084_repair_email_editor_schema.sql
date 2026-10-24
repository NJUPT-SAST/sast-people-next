-- 线上漏跑 0076 / 0078 / 0079 的补偿迁移。
--
-- drizzle-kit migrate 只比较 journal 里每个迁移的 when 与库里最后一条
-- drizzle.__drizzle_migrations.created_at；这三个迁移所在分支直到 0080–0083
-- 已经上线之后才合入 v3，合并后它们的 when 反而小于已应用的最新迁移，迁移器
-- 直接跳过且不报错。结果是邮箱编辑器需要的列在生产库不存在：
--   column "body_blocks" does not exist
-- 邮件中心整页服务端渲染失败（React #441），面试/笔试发信也连带失败。
--
-- 这里用幂等 DDL 补齐 0076（正文区块、主题色、样式预设表）、0078（邮件外框）
-- 与 0079（面试模板的同类字段）的全部结构，重复执行无副作用。

ALTER TABLE "email_template_setting"
  ADD COLUMN IF NOT EXISTS "body_blocks" jsonb;

ALTER TABLE "email_template_setting"
  ADD COLUMN IF NOT EXISTS "body_frame" jsonb;

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

ALTER TABLE "email_template_content"
  ADD COLUMN IF NOT EXISTS "body_blocks" jsonb;

ALTER TABLE "email_template_content"
  ADD COLUMN IF NOT EXISTS "body_frame" jsonb;

ALTER TABLE "email_template_content"
  ADD COLUMN IF NOT EXISTS "theme_color" varchar(16) NOT NULL DEFAULT '';
