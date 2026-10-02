-- 办公类部门面试招新：新流程类型 + 面试轮次 + 时段选择 + 志愿顺序 + 面试打分。
-- 流程按「部门 × 轮次」各建一条（flow.department 必填），候选人按志愿报名一/二面。
ALTER TYPE "public"."flow_type_enum" ADD VALUE IF NOT EXISTS 'office_interview';

-- 面试轮次：1=一面，2=二面；仅办公类部门面试招新流程使用
ALTER TABLE "flow"
  ADD COLUMN IF NOT EXISTS "round" smallint;

-- 面试时段选项（jsonb 数组：[{ "label": "13:00-14:00", "isConflict"? : true }]）
ALTER TABLE "flow"
  ADD COLUMN IF NOT EXISTS "slot_options" jsonb;

-- 报名记录：固化的轮次 / 候选人选择的时段
ALTER TABLE "user_flow"
  ADD COLUMN IF NOT EXISTS "round" smallint;

ALTER TABLE "user_flow"
  ADD COLUMN IF NOT EXISTS "interview_slot" varchar(100);

-- 第二志愿部门（Link 部门标识）：仅办公类部门面试招新使用
ALTER TABLE "user_flow"
  ADD COLUMN IF NOT EXISTS "second_choice_department" varchar(64);

-- 面试打分（0-100）
ALTER TABLE "interview_evaluation"
  ADD COLUMN IF NOT EXISTS "score" integer;

-- 结果通知模板的 QQ 群号（办公类部门面试：逐部门、逐轮次维护）
ALTER TABLE "email_template_setting"
  ADD COLUMN IF NOT EXISTS "group_number" varchar(64) NOT NULL DEFAULT '';
