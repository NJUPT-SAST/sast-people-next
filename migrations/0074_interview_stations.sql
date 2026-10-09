-- 办公类部门面试的「面试位」与签到绑定：
-- 一个大面试间里多位部长各自一对一面试，每个部门可配置并行几个面试位（= 同时面试几人）。
-- interview_checkin 记录候选人当前/最后所在的面试位，用于大屏按位展示与并发占用校验。

CREATE TABLE IF NOT EXISTS "interview_station" (
  "id" serial PRIMARY KEY NOT NULL,
  "fk_flow_id" integer NOT NULL,
  "label" varchar(32) NOT NULL,
  "fk_interviewer_id" integer,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "status" varchar(16) DEFAULT 'active' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "interview_station_flow_label_uidx" UNIQUE("fk_flow_id", "label"),
  CONSTRAINT "interview_station_flow_fk"
    FOREIGN KEY ("fk_flow_id")
    REFERENCES "public"."flow"("id")
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "interview_station_flow_order_idx"
  ON "interview_station" ("fk_flow_id", "sort_order");

ALTER TABLE "interview_checkin"
  ADD COLUMN IF NOT EXISTS "fk_station_id" integer;

ALTER TABLE "interview_checkin"
  DROP CONSTRAINT IF EXISTS "interview_checkin_station_fk";

ALTER TABLE "interview_checkin"
  ADD CONSTRAINT "interview_checkin_station_fk"
    FOREIGN KEY ("fk_station_id")
    REFERENCES "public"."interview_station"("id")
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "interview_checkin_station_idx"
  ON "interview_checkin" ("fk_station_id");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sastpeople') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON TABLE "interview_station" TO sastpeople;
    GRANT USAGE, SELECT
      ON SEQUENCE "interview_station_id_seq" TO sastpeople;
  END IF;
END $$;
