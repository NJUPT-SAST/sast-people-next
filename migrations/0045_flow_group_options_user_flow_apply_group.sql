-- 面试流程可配置投递组别选项；报名记录保存候选人选择的组别
ALTER TABLE "flow"
  ADD COLUMN IF NOT EXISTS "group_options" jsonb;

ALTER TABLE "user_flow"
  ADD COLUMN IF NOT EXISTS "apply_group" varchar(100);
