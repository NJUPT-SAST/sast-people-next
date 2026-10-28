-- 自定义邮件（写信）：草稿 / 定时发送 / 发送状态。
-- 每封自定义邮件最终仍拆成 email_delivery 逐人投递，正文快照、重试与审计不变。

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'email_custom_message_status_enum'
  ) THEN
    CREATE TYPE "public"."email_custom_message_status_enum"
      AS ENUM('draft', 'scheduled', 'sending', 'sent', 'failed', 'canceled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "email_custom_message" (
  "id" serial PRIMARY KEY NOT NULL,
  "status" "email_custom_message_status_enum" DEFAULT 'draft' NOT NULL,
  "subject" varchar(255) DEFAULT '' NOT NULL,
  "html_body" text DEFAULT '' NOT NULL,
  "recipient_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "manual_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "recipient_count" integer DEFAULT 0 NOT NULL,
  "scheduled_at" timestamptz,
  "sent_at" timestamptz,
  "created_by" integer NOT NULL,
  "updated_by" integer,
  "department" varchar(64),
  "last_error" text,
  "metadata" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "email_custom_message_status_scheduled_at_idx"
  ON "email_custom_message" ("status", "scheduled_at");

CREATE INDEX IF NOT EXISTS "email_custom_message_created_by_updated_at_idx"
  ON "email_custom_message" ("created_by", "updated_at");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sastpeople') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE "email_custom_message" TO sastpeople;
    GRANT USAGE, SELECT
      ON SEQUENCE "email_custom_message_id_seq" TO sastpeople;
  END IF;
END $$;

ALTER TABLE "email_delivery"
  ADD COLUMN IF NOT EXISTS "fk_custom_message_id" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_delivery_fk_custom_message_id_email_custom_message_id_fk'
  ) THEN
    ALTER TABLE "email_delivery"
      ADD CONSTRAINT "email_delivery_fk_custom_message_id_email_custom_message_id_fk"
      FOREIGN KEY ("fk_custom_message_id")
      REFERENCES "public"."email_custom_message"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "email_delivery_custom_message_created_at_idx"
  ON "email_delivery" ("fk_custom_message_id", "created_at");