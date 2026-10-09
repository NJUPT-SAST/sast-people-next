-- 办公类部门面试现场签到与叫号：
-- 候选人在面试现场由工作人员扫身份码（或手动检索）签到，系统按签到顺序分配叫号，
-- 部长在控制台叫号/进场/结束/过号，大屏轮询展示当前叫号与等待队列。
-- 一人一轮一条记录（user_flow.round 1=一面，2=二面），与 progress_status 正交。

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interview_checkin_status_enum') THEN
    CREATE TYPE "public"."interview_checkin_status_enum" AS ENUM (
      'waiting', 'called', 'interviewing', 'done', 'skipped', 'cancelled'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "interview_checkin" (
  "id" serial PRIMARY KEY NOT NULL,
  "fk_user_flow_id" integer NOT NULL,
  "fk_flow_id" integer NOT NULL,
  "round" smallint DEFAULT 1 NOT NULL,
  "queue_no" varchar(16) NOT NULL,
  "queue_seq" integer NOT NULL,
  "status" "interview_checkin_status_enum" DEFAULT 'waiting' NOT NULL,
  "method" varchar(16) NOT NULL,
  "room" varchar(64),
  "checked_in_at" timestamptz DEFAULT now() NOT NULL,
  "checked_in_by" integer NOT NULL,
  "called_at" timestamptz,
  "started_at" timestamptz,
  "finished_at" timestamptz,
  "call_count" smallint DEFAULT 0 NOT NULL,
  "note" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "interview_checkin_user_flow_round_uidx"
    UNIQUE("fk_user_flow_id", "round"),
  CONSTRAINT "interview_checkin_user_flow_fk"
    FOREIGN KEY ("fk_user_flow_id")
    REFERENCES "public"."user_flow"("id")
    ON DELETE CASCADE,
  CONSTRAINT "interview_checkin_flow_fk"
    FOREIGN KEY ("fk_flow_id")
    REFERENCES "public"."flow"("id")
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "interview_checkin_queue_idx"
  ON "interview_checkin" ("fk_flow_id", "round", "queue_seq");

CREATE INDEX IF NOT EXISTS "interview_checkin_status_idx"
  ON "interview_checkin" ("fk_flow_id", "round", "status");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sastpeople') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE "interview_checkin" TO sastpeople;
    GRANT USAGE, SELECT
      ON SEQUENCE "interview_checkin_id_seq" TO sastpeople;
  END IF;
END $$;
