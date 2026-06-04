-- ============================================
-- 0016: 飞书面试日程接入
-- ============================================
-- user_oauth_account: 将第三方 OAuth token 绑定到 Link 用户 ID。
-- interview_schedule: 保存 People 面评预约对应的飞书日程和会议信息。

CREATE TYPE "interview_schedule_status_enum" AS ENUM ('created', 'cancelled', 'failed');

CREATE TABLE "user_oauth_account" (
  "id" serial PRIMARY KEY NOT NULL,
  "fk_user_id" integer NOT NULL,
  "provider" varchar(32) NOT NULL,
  "provider_user_id" varchar(255) NOT NULL,
  "provider_union_id" varchar(255),
  "access_token" text NOT NULL,
  "refresh_token" text,
  "access_token_expires_at" timestamp,
  "refresh_token_expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "user_oauth_account_fk_user_id_provider_unique" UNIQUE("fk_user_id","provider"),
  CONSTRAINT "user_oauth_account_provider_provider_user_id_unique" UNIQUE("provider","provider_user_id")
);

CREATE TABLE "interview_schedule" (
  "id" serial PRIMARY KEY NOT NULL,
  "fk_user_flow_id" integer NOT NULL,
  "fk_evaluation_id" integer,
  "fk_organizer_id" integer NOT NULL,
  "provider" varchar(32) DEFAULT 'feishu' NOT NULL,
  "provider_event_id" varchar(255),
  "provider_reserve_id" varchar(255),
  "provider_meeting_no" varchar(255),
  "meeting_link" text NOT NULL,
  "summary" varchar(255) NOT NULL,
  "description" text,
  "attendee_email" varchar(254),
  "starts_at" timestamp NOT NULL,
  "ends_at" timestamp NOT NULL,
  "timezone" varchar(64) DEFAULT 'Asia/Shanghai' NOT NULL,
  "status" "interview_schedule_status_enum" DEFAULT 'created' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "interview_schedule"
  ADD CONSTRAINT "interview_schedule_fk_user_flow_id_user_flow_id_fk"
  FOREIGN KEY ("fk_user_flow_id") REFERENCES "user_flow"("id") ON DELETE cascade;

ALTER TABLE "interview_schedule"
  ADD CONSTRAINT "interview_schedule_fk_evaluation_id_interview_evaluation_id_fk"
  FOREIGN KEY ("fk_evaluation_id") REFERENCES "interview_evaluation"("id") ON DELETE set null;

CREATE INDEX "interview_schedule_user_flow_idx"
  ON "interview_schedule" ("fk_user_flow_id");

CREATE INDEX "interview_schedule_organizer_idx"
  ON "interview_schedule" ("fk_organizer_id");

CREATE UNIQUE INDEX "interview_schedule_provider_event_uidx"
  ON "interview_schedule" ("provider", "provider_event_id");
