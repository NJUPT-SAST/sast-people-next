-- 面试时段变更申请：候选人报名后可申请改时段，由部长及以上审批后生效。
CREATE TABLE IF NOT EXISTS "interview_slot_change_request" (
  "id" serial PRIMARY KEY NOT NULL,
  "fk_user_flow_id" integer NOT NULL REFERENCES "user_flow"("id") ON DELETE CASCADE,
  "requested_slot" varchar(100) NOT NULL,
  "reason" text,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "fk_requested_by" integer NOT NULL,
  "fk_reviewed_by" integer,
  "review_note" text,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- 同一条报名最多一个待审批申请
CREATE UNIQUE INDEX IF NOT EXISTS "interview_slot_change_pending_uidx"
  ON "interview_slot_change_request" ("fk_user_flow_id")
  WHERE "status" = 'pending';

CREATE INDEX IF NOT EXISTS "interview_slot_change_status_idx"
  ON "interview_slot_change_request" ("status");
