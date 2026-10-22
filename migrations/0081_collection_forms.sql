-- 成员信息收集表：部长及以上发起一轮收集，部员及以上填写自己的一行。
-- department = NULL 表示全体成员（管理员发起）；否则仅发起人所属部门的成员可见/可填。
-- 每个用户每张表一条提交，重复提交按 (fk_form_id, fk_user_id) 更新。

CREATE TABLE IF NOT EXISTS "collection_form" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" varchar(120) NOT NULL,
  "instructions" text DEFAULT '' NOT NULL,
  "extra_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "share_token" varchar(64) NOT NULL,
  "starts_at" timestamptz,
  "deadline" timestamptz,
  "allowed_roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" varchar(16) DEFAULT 'open' NOT NULL,
  "created_by" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "collection_form_share_token_uidx" UNIQUE("share_token")
);

CREATE INDEX IF NOT EXISTS "collection_form_status_idx"
  ON "collection_form" ("status", "created_at");

CREATE TABLE IF NOT EXISTS "collection_submission" (
  "id" serial PRIMARY KEY NOT NULL,
  "fk_form_id" integer NOT NULL,
  "fk_user_id" integer NOT NULL,
  "department" varchar(64),
  "club_name" varchar(120) NOT NULL,
  "category" varchar(32) NOT NULL,
  "name" varchar(60) NOT NULL,
  "birth_month" varchar(7) NOT NULL,
  "political_status" varchar(40) NOT NULL,
  "college" varchar(120) NOT NULL,
  "class_name" varchar(120) NOT NULL,
  "student_id" varchar(32) NOT NULL,
  "enrollment_year" smallint NOT NULL,
  "graduation_year" smallint NOT NULL,
  "extra_answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "collection_submission_form_user_uidx"
    UNIQUE("fk_form_id", "fk_user_id"),
  CONSTRAINT "collection_submission_form_fk"
    FOREIGN KEY ("fk_form_id")
    REFERENCES "public"."collection_form"("id")
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "collection_submission_form_department_idx"
  ON "collection_submission" ("fk_form_id", "department");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sastpeople') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE "collection_form" TO sastpeople;
    GRANT USAGE, SELECT
      ON SEQUENCE "collection_form_id_seq" TO sastpeople;
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE "collection_submission" TO sastpeople;
    GRANT USAGE, SELECT
      ON SEQUENCE "collection_submission_id_seq" TO sastpeople;
  END IF;
END $$;
