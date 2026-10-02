-- 改期申请升级：技术部门面试流程也能发起改期申请，申请理由改为必填。
-- * 技术部门（免试/WOC/SOC）绑定飞书日程，候选人在申请里给出希望改到的新时间；
-- * 办公类部门面试仍按 flow.slot_options 的时段（requested_slot）申请，两项二选一。
ALTER TABLE "interview_slot_change_request"
  ADD COLUMN IF NOT EXISTS "fk_interview_schedule_id" integer
    REFERENCES "interview_schedule"("id") ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS "requested_starts_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "requested_ends_at" timestamp with time zone;

ALTER TABLE "interview_slot_change_request"
  ALTER COLUMN "requested_slot" DROP NOT NULL;

-- 申请理由必填：存量空值回填空串后收紧约束（写入路径另行校验非空）
UPDATE "interview_slot_change_request" SET "reason" = '' WHERE "reason" IS NULL;
ALTER TABLE "interview_slot_change_request" ALTER COLUMN "reason" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "interview_slot_change_schedule_idx"
  ON "interview_slot_change_request" ("fk_interview_schedule_id");
