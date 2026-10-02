-- 办公类部门面试招新改为「一个共享流程 + 流程内两轮阶段」：
-- * flow.round 废弃（轮次不再按流程拆分，改为报名记录的当前阶段）
-- * interview_evaluation.round 记录面评属于哪一轮（1=一面，2=二面）
ALTER TABLE "flow" DROP COLUMN IF EXISTS "round";

ALTER TABLE "interview_evaluation"
  ADD COLUMN IF NOT EXISTS "round" smallint;
