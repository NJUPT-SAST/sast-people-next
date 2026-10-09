-- 过号次数：候选人被叫到但没到场时的累计次数。
-- 第一次过号会把他在本部门本轮队伍里往后顺延（号码不变），第二次过号就不再自动叫号
-- （人可能已经走了），需要部长手动重呼或取消签到。

ALTER TABLE "interview_checkin"
  ADD COLUMN IF NOT EXISTS "skip_count" smallint NOT NULL DEFAULT 0;
